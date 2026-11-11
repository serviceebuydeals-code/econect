import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';import PostalMime from 'postal-mime';
const load=async code=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db={prepare(query){let values=[];return{bind(...v){values=v;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}}}};
for(const id of ['admin','admin2','member']){
 sql.prepare("INSERT INTO auth_users(id,email,password_hash,salt,is_admin) VALUES(?,?,'hash','salt',?)").run(id,id+'@example.test',id==='member'?0:1);
 sql.prepare("INSERT INTO profiles(id,username,name,surname,age,country,state,city,origin_country,origin_state) VALUES(?,?,?,'Test',25,'NG','Lagos','Lagos','NG','Lagos')").run(id,id,id);
 sql.prepare("INSERT INTO push_subscriptions(id,user,endpoint,p256dh,auth,created) VALUES(?,?,?,'public','auth',0)").run(id+'device',id,'https://fcm.googleapis.com/'+id);
}
let identity={userId:'admin',isAdmin:true};globalThis.__cfAuth=async()=>identity;
const objects=new Map();const bucket={async put(key,value){objects.set(key,typeof value==='string'?new TextEncoder().encode(value):value instanceof ArrayBuffer?new Uint8Array(value.slice(0)):new Uint8Array(value).slice())},async get(key){return objects.has(key)?{body:objects.get(key).slice()}:null}};
const env={DB:db,BUCKET:bucket,APP_ORIGIN:'https://econect.test'};
globalThis.fetch=async()=>{throw Error('Cloudflare mail must not call Resend')};
const mail=await load(readFileSync('server/mail.ts','utf8').replace("import {getUser} from './auth';","const getUser=globalThis.__cfAuth;"));globalThis.__cfMail={...mail,PostalMime};
const {receiveCloudflareMail}=await load(readFileSync('server/cloudflare-mail.ts','utf8').replace("import PostalMime from 'postal-mime';",'const PostalMime=globalThis.__cfMail.PostalMime;').replace("import {getMailConfig,mailPlainText} from './mail';",'const {getMailConfig,mailPlainText}=globalThis.__cfMail;'));
async function req(path,body,user='admin'){identity=user?{userId:user,isAdmin:user!=='member'}:null;const response=await mail.mailRoute(new Request('https://econect.test/api/mail/'+path,body?{method:'POST',headers:{Origin:'https://econect.test','Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env);return{status:response.status,data:await response.json()}}
const headers=new Headers({'from':'Customer <customer@example.test>','reply-to':'help@example.test','message-id':'<incoming-1@example.test>','subject':'=?UTF-8?B?SGVsbG8=?=','date':'Wed, 11 Nov 2026 10:00:00 +0000','content-type':'multipart/mixed; boundary="mailboundary"'});
const raw=['From: Customer <customer@example.test>','Reply-To: help@example.test','Message-ID: <incoming-1@example.test>','Subject: =?UTF-8?B?SGVsbG8=?=','Date: Wed, 11 Nov 2026 10:00:00 +0000','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="mailboundary"','','--mailboundary','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: quoted-printable','','Hello caf=C3=A9','--mailboundary','Content-Type: text/plain','Content-Disposition: attachment; filename="note.txt"','Content-Transfer-Encoding: base64','','aGVsbG8=','--mailboundary--',''].join('\r\n');
function incoming(text=raw,to='support@econectapp.com',overrides={}){const bytes=new TextEncoder().encode(text),result={from:'customer@example.test',to,headers:new Headers(headers),raw:new ReadableStream({start(c){c.enqueue(bytes);c.close()}}),rawSize:bytes.byteLength,rejected:'',setReject(reason){this.rejected=reason},...overrides};return result}
assert.equal((await req('config')).data.provider,'cloudflare');assert.equal((await req('config')).data.canSend,false);
const unknown=incoming(raw,'unknown@econectapp.com');await receiveCloudflareMail(unknown,env);assert.ok(unknown.rejected);assert.equal(objects.size,0);
const huge=incoming('small','support@econectapp.com',{rawSize:26*1024*1024});await receiveCloudflareMail(huge,env);assert.ok(huge.rejected);assert.equal(objects.size,0);
await receiveCloudflareMail(incoming(),env);await receiveCloudflareMail(incoming('Received: different transport header\r\n'+raw),env);
const list=await req('list?folder=in');assert.equal(list.data.rows.length,1,'SMTP retries with changed Received headers import only once');
const message=(await req('message?id='+encodeURIComponent(list.data.rows[0].id))).data;assert.equal(message.provider,'cloudflare');assert.equal(message.subject,'Hello');assert.ok(message.body.includes('café'));assert.equal(message.replyAddress,'help@example.test');
const files=JSON.parse(message.attachments);assert.equal(files[0].filename,'note.txt');assert.ok(files[0].key.startsWith('private/admin-mail/'));assert.equal(new TextDecoder().decode(objects.get(files[0].key)),'hello');
assert.equal(sql.prepare("SELECT count(*) n FROM activity_notifications WHERE label LIKE 'Admin: new email received%'").get().n,2);
assert.equal(sql.prepare("SELECT count(*) n FROM push_deliveries WHERE kind='activity'").get().n,2);
async function download(part,user='admin'){identity=user?{userId:user,isAdmin:user!=='member'}:null;return mail.mailRoute(new Request('https://econect.test/api/mail/attachment?id='+encodeURIComponent(message.id)+'&part='+part),env)}
assert.equal((await download(0,'member')).status,403);assert.equal((await download('raw',null)).status,401);
const file=await download(0);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/^attachment;/);assert.equal(file.headers.get('content-type'),'application/octet-stream');assert.equal(file.headers.get('cache-control'),'private, no-store');assert.equal(await file.text(),'hello');
assert.equal(await(await download('raw')).text(),raw);assert.equal((await download(-1)).status,404);
const changedHeaders=new Headers(headers);changedHeaders.set('message-id','<incoming-2@example.test>');
await receiveCloudflareMail(incoming(raw.replace('Hello caf=C3=A9','A different message'),'support@econectapp.com',{headers:changedHeaders}),env);
assert.equal(sql.prepare("SELECT count(*) n FROM admin_mail_messages WHERE direction='in'").get().n,2,'new content cannot be hidden by reusing a message ID');
const bigBody='x'.repeat(5*1024*1024+100),large=incoming('Subject: Large message\r\n\r\n'+bigBody);await receiveCloudflareMail(large,env);
const largeRow=sql.prepare("SELECT body,raw_key FROM admin_mail_messages ORDER BY rowid DESC LIMIT 1").get();assert.ok(largeRow.body.includes('too large'));assert.ok(objects.has(largeRow.raw_key),'large messages retain the complete original for private download');
const outgoing={id:crypto.randomUUID(),to:'customer@example.test',subject:'Cloudflare support',body:'Thanks for contacting us.'};
assert.equal((await req('send',outgoing)).status,503,'no sender binding means no send is attempted');
let calls=0,release,mode='hold',captured;env.MAIL_SEND={async send(data){calls++;captured=data;if(mode==='hold')await new Promise(resolve=>release=resolve);if(mode==='unknown')throw Error('Uncertain connection');if(mode==='unverified')throw Object.assign(Error('Rejected'),{code:'E_SENDER_NOT_VERIFIED'});return{messageId:'accepted-'+calls}}};
assert.equal((await req('config')).data.canSend,true);
const start=req('send',outgoing);for(let i=0;i<10&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
assert.equal((await req('send',outgoing,'admin2')).status,409);release();assert.equal((await start).status,200);assert.equal((await req('send',outgoing)).status,200);assert.equal(calls,1);
assert.deepEqual(captured.from,{email:'support@econectapp.com',name:'eConect Support'});assert.equal(captured.replyTo,'support@econectapp.com');assert.equal(captured.headers['X-eConect-Mail-ID'],outgoing.id);assert.equal(captured.headers['Message-ID'],undefined);
assert.equal(sql.prepare("SELECT count(*) n FROM activity_notifications WHERE label LIKE 'Admin: email sent%'").get().n,2,'every administrator receives the accepted-send alert once');
mode='unknown';const uncertain={...outgoing,id:crypto.randomUUID()};assert.equal((await req('send',uncertain)).status,502);const beforeRetry=calls;assert.equal((await req('send',uncertain)).status,409);assert.equal(calls,beforeRetry,'an uncertain Cloudflare send is never automatically retried');assert.equal(sql.prepare('SELECT send_uncertain FROM admin_mail_messages WHERE id=?').get(uncertain.id).send_uncertain,1);
mode='unverified';const rejected={...outgoing,id:crypto.randomUUID()};assert.equal((await req('send',rejected)).status,502);assert.equal(sql.prepare('SELECT send_uncertain FROM admin_mail_messages WHERE id=?').get(rejected.id).send_uncertain,0);
mode='success';assert.equal((await req('send',rejected)).status,200,'known pre-acceptance rejections can be retried after configuration is fixed');
assert.equal(sql.prepare("SELECT count(*) n FROM activity_notifications WHERE label LIKE 'Admin: email sent%'").get().n,4);
assert.equal((await req('send',{...outgoing,id:crypto.randomUUID()},'member')).status,403);
assert.ok(readFileSync('server/worker.ts','utf8').includes('async email(message:ForwardableEmailMessage'));
const wr=JSON.parse(readFileSync('wrangler.jsonc','utf8'));assert.equal(wr.send_email[0].name,'MAIL_SEND');
console.log('PASS: Cloudflare native receiving needs no Resend key/webhook, decodes MIME and attachments, preserves large originals, rejects wrong recipients and oversize mail, deduplicates SMTP retries, restricts private downloads to admins, sends through the Cloudflare binding, blocks ambiguous-send retries, and queues exactly-once admin alerts (no live email sent).');
sql.close();
