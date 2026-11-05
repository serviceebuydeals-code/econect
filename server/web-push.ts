// RFC 8291 encryption and RFC 8292 VAPID, using Worker-native Web Crypto.
const enc=new TextEncoder();
export const bytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const base64=(b:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array?b:b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const concat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
const buffer=(b:Uint8Array)=>b.slice().buffer as ArrayBuffer;
async function hkdf(input:Uint8Array,salt:Uint8Array,info:Uint8Array,size:number){const k=await crypto.subtle.importKey('raw',buffer(input),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:buffer(salt),info:buffer(info)},k,size*8))}
export function validEndpoint(endpoint:string){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)}catch{return false}}
export async function encryptPush(subscription:{p256dh:string,auth:string},payload:unknown){
 const ua=bytes(subscription.p256dh),pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const receiver=await crypto.subtle.importKey('raw',buffer(ua),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiver},pair.privateKey,256)),salt=crypto.getRandomValues(new Uint8Array(16));
 const ikm=await hkdf(shared,bytes(subscription.auth),concat(enc.encode('WebPush: info\0'),ua,pub),32);
 const key=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
 const plain=enc.encode(JSON.stringify(payload));if(plain.length>3000)throw new Error('Push payload too large');
 const aes=await crypto.subtle.importKey('raw',buffer(key),'AES-GCM',false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:buffer(nonce)},aes,buffer(concat(plain,new Uint8Array([2])))));
 return concat(salt,new Uint8Array([0,0,16,0,65]),pub,cipher);
}
export async function vapidHeader(endpoint:string,publicKey:string,privateKey:string,origin:string){
 const header=base64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=base64(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:origin}))),unsigned=header+'.'+claims;
 const key=await crypto.subtle.importKey('jwk',JSON.parse(privateKey),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(unsigned));
 return 'vapid t='+unsigned+'.'+base64(sig)+', k='+publicKey;
}
