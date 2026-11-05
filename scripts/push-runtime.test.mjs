// Exercise the actual delivery pipeline in workerd, not Node's fetch implementation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
const cryptoSource=readFileSync('server/web-push.ts','utf8').replace(/export /g,'');
const pushSource=readFileSync('server/push.ts','utf8').replace("import {getUser} from './auth';","const getUser=async()=>null;").replace(/import .* from '.\/web-push';/,'').replace(/export /g,'');
const worker=`
let state='pending',status=0,leased=false,signing,subscription;
const db={prepare(sql){let args=[];return{bind(...v){args=v;return this},async all(){if(sql.startsWith('UPDATE push_deliveries')){if(leased)return{results:[]};leased=true;return{results:[{id:1,subscription:'device',user:'bob',kind:'test',source:'test',created:Math.floor(Date.now()/1000),attempts:1}]}}throw Error('Unexpected all')},async first(){if(sql.includes('FROM push_keys'))return signing;if(sql.includes('FROM push_subscriptions'))return subscription;throw Error('Unexpected first')},async run(){if(sql.includes('delivery_state=?')){state=args[0];status=args[1]}else if(sql.includes("delivery_state='retrying'"))state='retrying';return{}}}}};
export default {async fetch(request,env){
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 subscription={id:'device',endpoint:'https://fcm.googleapis.com/test',p256dh:base64(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:base64(crypto.getRandomValues(new Uint8Array(16)))};
 const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 signing={public_key:base64(await crypto.subtle.exportKey('raw',key.publicKey)),private_key:JSON.stringify(await crypto.subtle.exportKey('jwk',key.privateKey))};
 leased=false;state='pending';status=0;
 await dispatchPush({DB:db,APP_ORIGIN:'https://econectapp.com'},1);
 return Response.json({state,status});
}};
`;
const script=ts.transpileModule(cryptoSource+'\n'+pushSource+'\n'+worker,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
let outbound=0,providerStatus=201;
// Date supported by the bundled workerd; exercises the same edge fetch/WebCrypto APIs.
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-22',script,outboundService:async request=>{
 outbound++;assert.equal(new URL(request.url).hostname,'fcm.googleapis.com');assert.equal(request.method,'POST');assert.equal(request.headers.get('content-encoding'),'aes128gcm');assert.match(request.headers.get('authorization'),/^vapid t=/);assert.ok((await request.arrayBuffer()).byteLength>100);
 return new Response(null,{status:providerStatus,headers:providerStatus===302?{Location:'https://untrusted.example/'}:{}});
}});
try{
 let result=await(await mf.dispatchFetch('http://localhost/')).json();assert.equal(result.state,'accepted');assert.equal(result.status,201);assert.equal(outbound,1);
 providerStatus=302;result=await(await mf.dispatchFetch('http://localhost/')).json();assert.equal(result.state,'rejected');assert.equal(result.status,302);assert.equal(outbound,2,'redirect must never be followed');
 console.log('PASS: actual workerd encrypts, signs and sends Web Push successfully; redirects are rejected without following or forwarding credentials.');
}finally{await mf.dispose()}
