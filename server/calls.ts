import {getUser} from './auth';
import {meterCall} from './call-meter';
const uuid=/^[a-f0-9-]{36}$/i;
const fail=(message:string,status=400):never=>{throw Object.assign(Error(message),{status})};
export async function callsRoute(r:Request,env:Cloudflare.Env):Promise<Response>{try{
 const auth=await getUser(r);if(!auth)fail('Please log in.',401);const uid=auth!.userId,db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/calls/'.length),now=Date.now();
 const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args),one=(sql:string,...args:any[])=>q(sql,...args).first<any>();
 if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403);
 if(r.method==='GET'&&path==='status'){if(!auth!.isAdmin)fail('Admin only.',403);return Response.json({relayConfigured:!!env.TURN_KEY_ID&&!!env.TURN_API_TOKEN})}
 if(r.method==='GET'&&path==='config'){
  const fallback=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
  if(!env.TURN_KEY_ID||!env.TURN_API_TOKEN)return Response.json({iceServers:fallback,relay:false});
  await q("INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END",'turn:'+uid,now+3600000,now,now).run();
  if((await one('SELECT count FROM auth_attempts WHERE key=?','turn:'+uid)).count>60)fail('Too many call setup requests. Try later.',429);
  try{const response=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(env.TURN_KEY_ID)+'/credentials/generate-ice-servers',{method:'POST',headers:{Authorization:'Bearer '+env.TURN_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({ttl:86400}),signal:AbortSignal.timeout(8000)});const data:any=await response.json();
   if(!response.ok||!Array.isArray(data.iceServers)||!data.iceServers.some((s:any)=>(Array.isArray(s.urls)?s.urls:[s.urls]).some((u:any)=>typeof u==='string'&&/^turns?:/.test(u))))fail('Call connection service is temporarily unavailable.',503);
   return Response.json({iceServers:data.iceServers,relay:true});
  }catch{fail('Call connection service is temporarily unavailable.',503)}
 }
 if(r.method==='GET'&&path==='incoming'){
  const rows=(await q("SELECT c.id,c.conversation,c.video,c.created,c.expires,p.id person_id,p.username,p.name,p.avatar FROM rtc_calls c JOIN profiles p ON p.id=c.caller WHERE c.recipient=? AND c.status='ringing' AND c.expires>? ORDER BY c.created DESC LIMIT 1",uid,now).all()).results;return Response.json(rows);
 }
 const readCall=async(id:string)=>{let call=await one('SELECT * FROM rtc_calls WHERE id=? AND (caller=? OR recipient=?)',id,uid,uid);if(!call)fail('Call unavailable.',404);if(call.status!=='ended'&&call.expires<=now){await meterCall(db,id,now,true,'expired');call=await one('SELECT * FROM rtc_calls WHERE id=?',id)}return call};
 const view=(c:any)=>({id:c.id,status:c.status,video:!!c.video,conversation:c.conversation,connectedAt:c.connected_at,meterUntil:Math.min(c.caller_seen,c.recipient_seen)+5000,serverNow:now,seconds:c.billed_seconds,points:c.billed_seconds*20,caller:c.caller===uid,endReason:c.end_reason});
 if(r.method==='GET'&&path==='history'){
  const conversation=await one('SELECT * FROM conversations WHERE id=? AND (starter=? OR recipient=?)',url.searchParams.get('conversation'),uid,uid);if(!conversation)fail('Conversation unavailable.',404);
  const rows=(await q("SELECT id,caller,recipient,video,status,created,answered_at,connected_at,ended,billed_seconds,end_reason FROM rtc_calls WHERE ((caller=? AND recipient=?) OR (caller=? AND recipient=?)) ORDER BY created DESC LIMIT 20",conversation.starter,conversation.recipient,conversation.recipient,conversation.starter).all()).results;return Response.json(rows);
 }

 if(r.method==='GET'&&path==='poll'){
  const c=await readCall(url.searchParams.get('id')||''),after=Math.max(0,Number(url.searchParams.get('after'))||0);if(!Number.isSafeInteger(after))fail('Invalid call position.');
  if(c.status!=='ended'){const column=c.caller===uid?'caller_seen':'recipient_seen';await q('UPDATE rtc_calls SET '+column+'=? WHERE id=? AND status!=\'ended\'',now,c.id).run();if(c.status==='active')await q('UPDATE rtc_calls SET expires=CASE WHEN connected_at IS NULL THEN min(created+90000,min(caller_seen,recipient_seen)+15000) ELSE min(caller_seen,recipient_seen)+15000 END WHERE id=? AND status=\'active\'',c.id).run();await meterCall(db,c.id,now,!(await one("SELECT id FROM conversations WHERE id=? AND status='active'",c.conversation)),'conversation ended')}
  const fresh=await one('SELECT * FROM rtc_calls WHERE id=?',c.id);
  const events=(await q('SELECT id,kind,body FROM rtc_signals WHERE call_id=? AND sender<>? AND id>? ORDER BY id LIMIT 300',c.id,uid,after).all()).results;
  return Response.json({...view(fresh),events});
 }
 if(r.method!=='POST')fail('Not found.',404);
 if(r.headers.get('Origin')&&r.headers.get('Origin')!==url.origin)fail('Invalid origin.',403);
 const raw=await r.text();if(raw.length>65536)fail('Call signal too large.',413);const b=JSON.parse(raw);if(!uuid.test(String(b.id||'')))fail('Invalid call.');
 if(path==='start'){
  const previous=await one('SELECT caller FROM rtc_calls WHERE id=?',b.id);if(previous){if(previous.caller!==uid)fail('Call unavailable.',403);return Response.json({id:b.id})}
  const c=await one("SELECT * FROM conversations WHERE id=? AND (starter=? OR recipient=?) AND status='active'",b.conversation,uid,uid);if(!c)fail('Start a conversation first.');
  if(b.offer?.type!=='offer'||typeof b.offer.sdp!=='string'||b.offer.sdp.length>50000)fail('Invalid call offer.');
  await q("INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END",'call-start:'+uid,now+900000,now,now).run();
  if((await one('SELECT count FROM auth_attempts WHERE key=?','call-start:'+uid)).count>30)fail('Too many call attempts. Please try later.',429);
  if((await one('SELECT balance+bonus total FROM profiles WHERE id=?',uid)).total<100)fail('Insufficient eCoin. At least 1 eCoin is required to start a call.',402);
  const person=c.starter===uid?c.recipient:c.starter;
  await db.batch([q('INSERT INTO rtc_calls(id,conversation,caller,recipient,video,created,expires,caller_seen) VALUES(?,?,?,?,?,?,?,?)',b.id,c.id,uid,person,b.video?1:0,now,now+60000,now),q("INSERT INTO rtc_signals(call_id,sender,kind,body,created) VALUES(?,?,'offer',?,?)",b.id,uid,JSON.stringify(b.offer),now)]);
  return Response.json({id:b.id});
 }
 const c=await readCall(b.id);
 if(path==='hangup'){if(b.decline&&c.status!=='ringing')return Response.json({ok:true});await meterCall(db,c.id,now,true,b.decline?'declined':'ended');return Response.json({ok:true})}
 if(c.status==='ended')fail('This call has ended.',410);
 if(path==='connected'){
  if(c.status!=='active')fail('Answer the call first.',409);
  const column=c.caller===uid?'caller_connected':'recipient_connected';
  await q('UPDATE rtc_calls SET '+column+'=1 WHERE id=? AND status=\'active\'',c.id).run();
  await q("UPDATE rtc_calls SET connected_at=?,caller_seen=?,recipient_seen=?,expires=? WHERE id=? AND status='active' AND connected_at IS NULL AND caller_connected=1 AND recipient_connected=1",now,now,now,now+15000,c.id).run();
  return Response.json(view(await one('SELECT * FROM rtc_calls WHERE id=?',c.id)));
 }
 if(path==='answer'){
  if(c.recipient!==uid)fail('Only the recipient can answer.',403);if(b.answer?.type!=='answer'||typeof b.answer.sdp!=='string'||b.answer.sdp.length>50000)fail('Invalid call answer.');
  // Claim the answer in the same transaction as its signal; another device cannot answer twice.
  const claimed=await db.batch([q("INSERT INTO rtc_signals(call_id,sender,kind,body,created) SELECT ?,?,'answer',?,? WHERE EXISTS(SELECT 1 FROM rtc_calls WHERE id=? AND status='ringing')",c.id,uid,JSON.stringify(b.answer),now,c.id),q("UPDATE rtc_calls SET status='active',recipient_seen=?,answered_at=?,expires=caller_seen+45000 WHERE id=? AND status='ringing'",now,now,c.id)]);
  if(!claimed[1].meta?.changes)fail('This call was already answered.',409);return Response.json({ok:true});
 }
 if(path==='ice'){
  if(!Array.isArray(b.candidates)||b.candidates.length>25)fail('Invalid network candidates.');
  const count=(await one("SELECT count(*) n FROM rtc_signals WHERE call_id=? AND sender=? AND kind='ice'",c.id,uid)).n;if(count+b.candidates.length>256)fail('Too many network candidates.',429);
  const statements=b.candidates.map((v:any)=>{if(typeof v?.candidate!=='string'||v.candidate.length>4096||v.sdpMid!==null&&v.sdpMid!==undefined&&typeof v.sdpMid!=='string'||v.sdpMLineIndex!==null&&v.sdpMLineIndex!==undefined&&!Number.isInteger(v.sdpMLineIndex))fail('Invalid network candidate.');return q("INSERT INTO rtc_signals(call_id,sender,kind,body,created) VALUES(?,?,'ice',?,?)",c.id,uid,JSON.stringify(v),now)});
  if(statements.length)await db.batch(statements);return Response.json({ok:true});
 }
 return fail('Not found.',404);
}catch(e:any){return Response.json({error:/already on a call/.test(e.message)?'One of you is already on a call.':e.status?e.message:'Call service unavailable.'},{status:e.status||(/already on a call/.test(e.message)?409:503)})}}
