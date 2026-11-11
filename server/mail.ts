import {getUser} from './auth';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const email=/^[a-zA-Z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
const fail=(message:string,status=400):never=>{throw Object.assign(Error(message),{status})};
const clean=(v:any,n:number)=>String(v??'').trim().slice(0,n);
const address=(value:any)=>{const raw=String(value||'').trim(),match=raw.match(/<([^<>]+)>$/);return (match?match[1]:raw).trim().toLowerCase()};
function plain(html:string){return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/?(?:p|div|br|tr|li|h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[x]||x))}
async function signed(r:Request,raw:string,secret:string){
 const id=r.headers.get('svix-id')||'',timestamp=r.headers.get('svix-timestamp')||'',signatures=r.headers.get('svix-signature')||'';
 if(!id||id.length>200||!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||signatures.length>2048)return false;
 try{const keyBytes=Uint8Array.from(atob(secret.replace(/^whsec_/,'')),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['verify']),data=new TextEncoder().encode(id+'.'+timestamp+'.'+raw);
  for(const part of signatures.split(' ')){if(!part.startsWith('v1,'))continue;try{const signature=Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0));if(await crypto.subtle.verify('HMAC',key,signature,data))return true}catch{}}
 }catch{}return false;
}
export async function mailRoute(r:Request,env:Cloudflare.Env):Promise<Response>{try{
 const url=new URL(r.url),path=url.pathname.slice('/api/mail/'.length),db=env.DB;
 const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args),one=(sql:string,...args:any[])=>q(sql,...args).first<any>();
 const config=async()=>{const row=await one("SELECT value FROM settings WHERE key='admin_mail_config'");try{const saved=JSON.parse(row?.value||'{}');if(email.test(saved.address)&&saved.address.endsWith('@econectapp.com')&&typeof saved.name==='string'&&!/[\r\n<>"]/.test(saved.name))return saved}catch{}return{address:'support@econectapp.com',name:'eConect Support'}};
 const provider=async(path:string,init:RequestInit={})=>{
  if(!env.RESEND_API_KEY)fail('Add RESEND_API_KEY in Cloudflare Secrets to connect email.',503);
  const response=await fetch('https://api.resend.com/'+path,{...init,redirect:'error',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(12000)});
  const data:any=await response.json().catch(()=>null);if(!response.ok||!data)fail('Resend could not complete the email request (HTTP '+response.status+'). Check API key permissions and domain verification.',502);return data;
 };
 if(path==='webhook'){
  if(r.method!=='POST')fail('Method not allowed.',405);
  if(!env.RESEND_WEBHOOK_SECRET)fail('Incoming mail connection is not configured.',503);
  if(Number(r.headers.get('content-length')||0)>100000)fail('Event too large.',413);
  const raw=await r.text();if(new TextEncoder().encode(raw).length>100000)fail('Event too large.',413);
  if(!await signed(r,raw,env.RESEND_WEBHOOK_SECRET!))fail('Invalid email signature.',401);
  const event=JSON.parse(raw);if(event.type!=='email.received')return Response.json({ok:true});
  const data=event.data||{},id=String(data.email_id||'');if(!uuid.test(id))fail('Invalid email event.');
  const c=await config(),to=Array.isArray(data.to)?data.to:[];
  if(!to.some((v:any)=>address(v)===c.address))return Response.json({ok:true,ignored:true});
  if(await one('SELECT id FROM admin_mail_messages WHERE id=?','in:'+id))return Response.json({ok:true});
  const received=await provider('emails/receiving/'+encodeURIComponent(id));
  if(!Array.isArray(received.to)||!received.to.some((v:any)=>address(v)===c.address))fail('Email recipient does not match this mailbox.',502);
  const sender=clean(received.from||data.from,320),subject=clean(received.subject||data.subject||'(No subject)',998),body=String(received.text||plain(String(received.html||''))||'(No text content)').slice(0,200000);
  const attachments=(Array.isArray(received.attachments)?received.attachments:Array.isArray(data.attachments)?data.attachments:[]).slice(0,100).map((v:any)=>({filename:clean(v.filename,200),content_type:clean(v.content_type,100)}));
  await q("INSERT OR IGNORE INTO admin_mail_messages(id,direction,mailbox,sender,recipient,subject,body,attachments,provider_id,status,created_ms) VALUES(?,'in',?,?,?,?,?,?,?,'received',?)",'in:'+id,c.address,sender,c.address,subject,body,JSON.stringify(attachments),id,Date.now()).run();
  return Response.json({ok:true});
 }
 const auth=await getUser(r);if(!auth)fail('Please log in.',401);if(!auth!.isAdmin)fail('Admin only.',403);
 if(r.method==='GET'){
  if(path==='config'){const c=await config();return Response.json({...c,hasKey:!!env.RESEND_API_KEY,hasWebhookSecret:!!env.RESEND_WEBHOOK_SECRET,webhookUrl:new URL('/api/mail/webhook',env.APP_ORIGIN||url.origin).href,unread:(await one("SELECT count(*) n FROM admin_mail_messages WHERE direction='in' AND read_at IS NULL AND archived=0")).n,lastReceived:(await one("SELECT created FROM admin_mail_messages WHERE direction='in' AND mailbox=? ORDER BY created_ms DESC LIMIT 1",c.address))?.created||null})}
  if(path==='list'){const folder=url.searchParams.get('folder')||'in',offset=Number(url.searchParams.get('offset')||0);if(!['in','out','archive'].includes(folder)||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Invalid mail folder.');
   const where=folder==='archive'?'archived=1':"archived=0 AND direction='"+folder+"'";
   const rows=(await q('SELECT id,direction,mailbox,sender,recipient,subject,status,created,created_ms,read_at,archived,last_error FROM admin_mail_messages WHERE '+where+' ORDER BY created_ms DESC,id DESC LIMIT 51 OFFSET ?',offset).all()).results;return Response.json({rows:rows.slice(0,50),next:rows.length>50?offset+50:null});
  }
  if(path==='message'){const row=await one('SELECT * FROM admin_mail_messages WHERE id=?',clean(url.searchParams.get('id'),80));if(!row)fail('Email not found.',404);return Response.json({...row,replyAddress:address(row.sender)})}
  fail('Not found.',404);
 }
 if(r.method!=='POST')fail('Method not allowed.',405);
 if(r.headers.get('Origin')!==url.origin)fail('Invalid origin.',403);
 if(Number(r.headers.get('Content-Length')||0)>250000)fail('Request too large.',413);
 const raw=await r.text();if(new TextEncoder().encode(raw).length>250000)fail('Request too large.',413);const b=JSON.parse(raw);
 if(path==='settings'){
  const a=clean(b.address,254).toLowerCase(),name=clean(b.name,80);if(!email.test(a)||!a.endsWith('@econectapp.com')||!name||/[\r\n<>"]/.test(name))fail('Use an @econectapp.com address and a sender name without email header characters.');
  await q("INSERT INTO settings(key,value) VALUES('admin_mail_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify({address:a,name})).run();return Response.json({ok:true});
 }
 if(path==='read'||path==='archive'){
  if(path==='archive'&&typeof b.archived!=='boolean')fail('Choose a valid archive action.');
  const id=clean(b.id,80);const row=await one('SELECT id FROM admin_mail_messages WHERE id=?',id);if(!row)fail('Email not found.',404);
  if(path==='read')await q('UPDATE admin_mail_messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=?',id).run();
  else await q('UPDATE admin_mail_messages SET archived=? WHERE id=?',b.archived?1:0,id).run();return Response.json({ok:true});
 }
 if(path==='send'){
  const id=String(b.id||''),to=clean(b.to,254).toLowerCase(),subject=clean(b.subject,200),body=String(b.body||'').trim();
  if(!uuid.test(id)||!email.test(to)||!subject||/[\r\n]/.test(subject)||!body||body.length>50000)fail('Enter a valid recipient, subject and message (up to 50,000 characters).');
  if(!env.RESEND_API_KEY)fail('Email sending is not configured.',503);
  const c=await config(),from=c.name+' <'+c.address+'>',now=Date.now();
  await q("INSERT OR IGNORE INTO admin_mail_messages(id,direction,mailbox,sender,recipient,subject,body,status,created_ms,created_by) VALUES(?,'out',?,?,?,?,?,'pending',?,?)",id,c.address,from,to,subject,body,now,auth!.userId).run();
  const row=await one('SELECT * FROM admin_mail_messages WHERE id=?',id);
  if(row.direction!=='out'||row.recipient!==to||row.subject!==subject||row.body!==body)fail('This send ID belongs to another message. Start a new email.',409);
  if(row.status==='sent')return Response.json({ok:true,id,state:'accepted'});
  if(now-row.created_ms>23*3600000)fail('This send attempt is too old to retry safely. Check its status in Resend before starting a new email.',409);
  const claimed=await q("UPDATE admin_mail_messages SET lease_until=?,attempts=attempts+1,status='pending',last_error='' WHERE id=? AND status IN('pending','failed') AND lease_until<=?",now+30000,id,now).run();
  if(!claimed.meta.changes)fail('This email is already being sent. Refresh Sent before retrying.',409);
  try{const sent=await provider('emails',{method:'POST',headers:{'Idempotency-Key':'econect-mail/'+id},body:JSON.stringify({from:row.sender,to:[row.recipient],reply_to:row.mailbox,subject:row.subject,text:row.body})});if(!uuid.test(String(sent.id||'')))fail('Resend returned an invalid email receipt.',502);
   await q("UPDATE admin_mail_messages SET status='sent',provider_id=?,lease_until=0,last_error='' WHERE id=? AND status!='sent'",sent.id,id).run();return Response.json({ok:true,id,state:'accepted'});
  }catch(e:any){await q("UPDATE admin_mail_messages SET status='failed',lease_until=0,last_error=? WHERE id=? AND status!='sent'",e.status?'Provider rejected or could not complete this request. Check Resend before retrying.':'The provider did not confirm this send. Check Resend before retrying.',id).run();throw e}
 }
 return fail('Not found.',404);
}catch(e:any){return Response.json({error:e.status?e.message:e instanceof SyntaxError?'Invalid request.':'Mail service unavailable. Please try again.'},{status:e.status|| (e instanceof SyntaxError?400:503)})}}
