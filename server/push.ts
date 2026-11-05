import {getUser} from './auth';
import {base64,bytes,encryptPush,vapidHeader,validEndpoint} from './web-push';
async function keys(db:D1Database){
 let row=await db.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first<any>();if(row)return row;
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 await db.prepare('INSERT OR IGNORE INTO push_keys(id,public_key,private_key) VALUES(1,?,?)').bind(base64(await crypto.subtle.exportKey('raw',pair.publicKey)),JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey))).run();
 return await db.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first<any>();
}
export async function pushRoute(r:Request,env:Cloudflare.Env){
 const auth=await getUser(r);if(!auth)return Response.json({error:'Please log in.'},{status:401,headers:{'X-eConect-Push-Version':'2'}});
 const url=new URL(r.url),path=url.pathname.slice('/api/push/'.length),db=env.DB,uid=auth.userId;
 if(r.method==='GET'&&path==='key')return Response.json({publicKey:(await keys(db)).public_key});
 if(r.method!=='POST')return new Response('Method not allowed',{status:405});
 if(r.headers.get('Origin')!==url.origin)return Response.json({error:'Invalid origin.'},{status:403});
 if(Number(r.headers.get('Content-Length')||0)>8192)return new Response('Too large',{status:413});
 let b:any;try{const raw=await r.text();if(raw.length>8192)return new Response('Too large',{status:413});b=JSON.parse(raw)}catch{return Response.json({error:'Invalid request.'},{status:400})}
 const endpoint=String(b.endpoint||'');
 if(path==='disable'){await db.batch([db.prepare('DELETE FROM push_deliveries WHERE subscription IN(SELECT id FROM push_subscriptions WHERE user=? AND endpoint=?)').bind(uid,endpoint),db.prepare('DELETE FROM push_subscriptions WHERE user=? AND endpoint=?').bind(uid,endpoint)]);return Response.json({ok:true})}
 if(path==='status')return Response.json({enabled:!!await db.prepare('SELECT id FROM push_subscriptions WHERE endpoint=? AND user=?').bind(endpoint,uid).first()});
 if(path==='subscribe'){
  try{if(!validEndpoint(endpoint)||endpoint.length>2048||bytes(b.keys?.p256dh||'').length!==65||bytes(b.keys?.auth||'').length!==16)throw 0;
   await crypto.subtle.importKey('raw',bytes(b.keys.p256dh).buffer as ArrayBuffer,{name:'ECDH',namedCurve:'P-256'},false,[]);
  }catch{return Response.json({error:'Invalid device registration.'},{status:400})}
  const owner=await db.prepare('SELECT user FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first<any>();
  if(owner&&owner.user!==uid)return Response.json({error:'Disable notifications for the previous account on this device first.'},{status:409});
  const count=await db.prepare('SELECT count(*) n FROM push_subscriptions WHERE user=?').bind(uid).first<any>();
  if(!owner&&count.n>=10)return Response.json({error:'Too many registered devices.'},{status:400});
  await keys(db);
  await db.prepare('INSERT INTO push_subscriptions(id,user,endpoint,p256dh,auth,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth').bind(crypto.randomUUID(),uid,endpoint,b.keys.p256dh,b.keys.auth,Date.now()).run();
  return Response.json({ok:true});
 }
 if(path==='test'){
  const s=await db.prepare('SELECT id FROM push_subscriptions WHERE user=? AND endpoint=?').bind(uid,endpoint).first<any>();if(!s)return Response.json({error:'Enable notifications first.'},{status:400});
  const recent=await db.prepare("SELECT id FROM push_deliveries WHERE subscription=? AND kind='test' AND created>unixepoch()-60").bind(s.id).first();if(recent)return Response.json({error:'Wait one minute before another test.'},{status:429});
  const delivery=await db.prepare("INSERT INTO push_deliveries(subscription,user,kind,source) VALUES(?,?,'test','test') RETURNING id").bind(s.id,uid).first<any>();
  await dispatchPush(env,delivery.id);
  const result=await db.prepare('SELECT delivery_state,provider_status FROM push_deliveries WHERE id=? AND user=?').bind(delivery.id,uid).first<any>();
  if(result?.delivery_state==='accepted')return Response.json({ok:true,state:'accepted'});
  const expired=result?.delivery_state==='expired',code=result?.provider_status||0;
  return Response.json({error:expired?'This device registration expired. Turn notifications off, then enable them again.':code?'The push service rejected the test (HTTP '+code+'). Please report this code.':'The test could not be sent to the push service. Please try again.',code:expired?'PUSH_EXPIRED':'PUSH_DELIVERY_FAILED'},{status:502});
 }
 return new Response('Not found',{status:404});
}
export async function dispatchPush(env:Cloudflare.Env,deliveryId?:number){
 const db=env.DB,now=Math.floor(Date.now()/1000);
 // Atomic lease: concurrent requests and cron must not send the same row together.
 const rows=(await db.prepare('UPDATE push_deliveries SET next_attempt=?,attempts=attempts+1 WHERE id IN(SELECT id FROM push_deliveries WHERE done=0 AND next_attempt<=? AND attempts<6 AND (? IS NULL OR id=?) ORDER BY id LIMIT 20) RETURNING *').bind(now+60,now,deliveryId??null,deliveryId??null).all<any>()).results;
 if(!rows.length)return;
 const signing=await keys(db);
 for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(async row=>{
  try{
   const finish=(state='skipped',status=0)=>db.prepare('UPDATE push_deliveries SET done=1,delivery_state=?,provider_status=? WHERE id=?').bind(state,status,row.id).run();
   let giftSender='';const s=await db.prepare('SELECT * FROM push_subscriptions WHERE id=? AND user=?').bind(row.subscription,row.user).first<any>();
   if(!s||now-row.created>(row.kind==='call'?60:86400)){await finish();return}
   if(row.conversation){
    const m=await db.prepare('SELECT m.rowid n,m.kind FROM messages m WHERE m.id=? AND m.conversation=?').bind(row.source,row.conversation).first<any>();
    if(!m){await finish();return}
    const read=await db.prepare('SELECT last_row FROM message_reads WHERE user=? AND conversation=?').bind(row.user,row.conversation).first<any>();
    const ended=row.kind==='call'?await db.prepare("SELECT id FROM messages WHERE conversation=? AND rowid>? AND kind IN('answer','hangup','call-end') LIMIT 1").bind(row.conversation,m.n).first():null;
    if(ended||(read&&read.last_row>=m.n&&row.kind!=='call')){await finish();return}
   }
   if(row.kind==='activity'){const a=await db.prepare('SELECT n.read_at,(SELECT p.username FROM gift_ledger_senders g JOIN profiles p ON p.id=g.sender_id WHERE g.ledger_id=n.ledger_id LIMIT 1) gift_sender_username FROM activity_notifications n WHERE n.id=? AND n.user=?').bind(row.source,row.user).first<any>();if(!a||a.read_at){await finish();return}giftSender=a.gift_sender_username||''}
   // Keep personal message content off the lock screen.
   const body=row.kind==='call'?'You have an incoming call.':row.kind==='message'?'You have a new message.':row.kind==='test'?'Background notifications are enabled.':giftSender?'You received an eCoin gift from @'+giftSender+'.':'You have new activity.';
   const payload={title:'eConect',body,url:'/?notification='+encodeURIComponent(row.kind==='message'||row.kind==='call'?'messages':'activity')+(row.conversation?'&conversation='+encodeURIComponent(row.conversation):''),tag:'econect-'+row.kind+'-'+(row.conversation||row.id),expires:(row.created+(row.kind==='call'?60:86400))*1000};
   const encrypted=await encryptPush(s,payload),authorization=await vapidHeader(s.endpoint,signing.public_key,signing.private_key,env.APP_ORIGIN||'https://econectapp.com');
   const response=await fetch(s.endpoint,{method:'POST',redirect:'manual',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(row.kind==='call'?60:86400),Urgency:row.kind==='call'?'high':'normal'},body:encrypted.buffer as ArrayBuffer,signal:AbortSignal.timeout(10000)});
   if(response.ok){await finish('accepted',response.status);return}
   if(response.status>=300&&response.status<400){await finish('rejected',response.status);console.error('Push redirect refused',response.status);return}
   if(response.status===404||response.status===410){await db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(s.id).run();await finish('expired',response.status);return}
   if(response.status>=400&&response.status<500&&response.status!==429){await finish('rejected',response.status);console.error('Push provider rejected delivery',response.status);return}
   await db.prepare("UPDATE push_deliveries SET next_attempt=?,delivery_state='retrying',provider_status=? WHERE id=?").bind(now+Math.min(3600,60*2**row.attempts),response.status,row.id).run();
  }catch{await db.prepare("UPDATE push_deliveries SET delivery_state='retrying' WHERE id=?").bind(row.id).run();console.error('Push delivery failed; retry scheduled')}
 }));
 await db.prepare('DELETE FROM push_deliveries WHERE created<?').bind(now-172800).run();
}
