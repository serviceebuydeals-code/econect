import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
const db={prepare(sql){let vals=[];return{bind(...v){vals=v;return this},async first(){return sqlite.prepare(sql).get(...vals)||null},async all(){return{results:sqlite.prepare(sql).all(...vals)}},async run(){const result=sqlite.prepare(sql).run(...vals);return{success:true,meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let identity=null;globalThis.__econectTest={env:{DB:db},getAuth:async()=>identity};
let code=readFileSync('server/api.ts','utf8').replace("import{env}from'cloudflare:workers';import{getUser}from'./auth';","const env=globalThis.__econectTest.env;const getUser=globalThis.__econectTest.getAuth;");
code=code.replace("import{getCoinPrice,coinAmount}from'./pricing';",readFileSync('server/pricing.ts','utf8').replace(/export /g,''));
code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
async function request(path,body,user){identity=user?{userId:user,isAdmin:user==='admin',email:user==='admin'?'admin@example.test':user+'@test.invalid'}:null;const req=new Request('https://econect.test/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://econect.test'},body:JSON.stringify(body)}:{});const r=await route[body?'POST':'GET'](req);return{status:r.status,data:await r.json()}}
const form={surname:'Test',age:25,country:'Nigeria',state:'Lagos',city:'Lagos',originCountry:'Nigeria',originState:'Lagos'};
assert.equal((await request('post',{body:'Anonymous',media:[]})).status,401);
for(const user of ['alice','bob','carol','admin'])assert.equal((await request('signup',{...form,name:user,username:user},user)).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='alice'").get().bonus,200);assert.equal(sqlite.prepare("SELECT count(*) n FROM ledger WHERE id='alice-welcome'").get().n,1);sqlite.prepare('UPDATE profiles SET bonus=0').run();sqlite.prepare("UPDATE profiles SET balance=CASE id WHEN 'bob' THEN 8 WHEN 'carol' THEN 4 ELSE 0 END").run();
assert.equal((await request('signup',{...form,name:'duplicate',username:'alice'},'duplicate')).status,400);
await request('post',{body:'A real community post',media:[]},'alice');let post=sqlite.prepare('SELECT * FROM posts').get();
const firstLike={post:post.id,id:crypto.randomUUID()};await request('like',firstLike,'bob');await request('like',firstLike,'bob');assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='alice'").get().balance,4);
await request('comment',{post:post.id,body:'Hello'},'bob');let comment=sqlite.prepare('SELECT * FROM comments').get();
await request('comment',{post:post.id,body:'A thoughtful reply',parent:comment.id},'carol');assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='alice'").get().balance,10);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='bob'").get().balance,2);
assert.equal((await request('admin/bank',{bank:'Test Bank',name:'eConect Test',number:'0000000000'},'alice')).status,403);
await request('admin/bank',{bank:'Test Bank',name:'eConect Test',number:'0000000000'},'admin');
await request('admin/contestant',{username:'bob'},'admin');
const payment=await request('payment',{coins:2,kind:'vote',recipient:'bob'},'alice');assert.equal(payment.data.amount,3000);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='bob'").get().balance,2);
await request('payment-sent',{id:payment.data.id,reference:'TEST TRANSFER'},'alice');
await request('admin/payment',{id:payment.data.id},'admin');assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='bob'").get().balance,202);assert.equal((await request('admin/payment',{id:payment.data.id},'admin')).status,400);assert.equal(sqlite.prepare('SELECT count(*) n FROM votes').get().n,1);
assert.equal((await request('gift',{coins:1,kind:'vote',recipient:'bob'},'alice')).status,400);
let before=sqlite.prepare('SELECT sum(balance) total FROM profiles').get().total;assert.equal((await request('gift',{coins:1,kind:'gift',recipient:'bob'},'alice')).status,400);assert.equal(sqlite.prepare('SELECT sum(balance) total FROM profiles').get().total,before);
sqlite.prepare("UPDATE profiles SET balance=balance+1000 WHERE id='alice'").run();assert.equal((await request('gift',{coins:1,kind:'gift',recipient:'bob'},'alice')).status,200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='alice'").get().balance,910);
const chat=(await request('chat',{recipient:'bob'},'alice')).data;assert.equal((await request('messages?id='+chat.id,undefined,'carol')).status,404);
await request('message',{conversation:chat.id,kind:'text',body:'Hello'},'alice');await request('message',{conversation:chat.id,kind:'text',body:'Hi!'},'bob');assert.equal(sqlite.prepare('SELECT sum(texts) texts FROM conversation_usage WHERE conversation=?').get(chat.id).texts,2);
sqlite.prepare('UPDATE conversations SET texts=1000,seconds=60 WHERE id=?').run(chat.id);const settled=await request('end-chat',{conversation:chat.id},'bob');assert.equal(settled.data.points,8);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='alice'").get().balance,902);assert.equal((await request('end-chat',{conversation:chat.id},'alice')).status,400);
assert.equal((await request('admin/branding',{logo:'/api/media?key=public%2Ftest',favicon:''},'admin')).status,200);assert.equal((await request('admin/branding',{logo:'https://example.invalid',favicon:''},'admin')).status,400);
const bootstrap=(await request('bootstrap')).data;assert.ok(!('age' in bootstrap.members[0]));assert.equal(bootstrap.voters.length,1);assert.equal(bootstrap.contestants[0].id,'bob');assert.equal(bootstrap.branding.logo,'/api/media?key=public%2Ftest');
console.log('PASS: signup, access checks, duplicate likes, comment/reply points, payment confirmation, vote ranking, overdraft rollback, gifts, conversation billing/privacy, branding, public field privacy.');
// Bonus remains non-withdrawable through gifts and mixed-source settlement.
await request('signup',{...form,name:'Dave',username:'dave'},'dave');
assert.equal((await request('wallet',undefined,'dave')).data.bonus,200);const remaining=(await request('balance',undefined,'dave')).data;assert.equal(remaining.total,200);assert.equal(remaining.balance,0);assert.equal(remaining.bonus,200);
await request('gift',{coins:1,kind:'gift',recipient:'bob'},'dave');
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='dave'").get().bonus,100);
assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='dave'").get().balance,0);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='bob'").get().bonus,100);
assert.equal(sqlite.prepare("SELECT bucket FROM ledger WHERE user='bob' ORDER BY rowid DESC LIMIT 1").get().bucket,'bonus');
sqlite.prepare("UPDATE profiles SET bonus=50,balance=100 WHERE id='dave'").run();
const bobBefore=sqlite.prepare("SELECT balance FROM profiles WHERE id='bob'").get().balance;
await request('gift',{coins:1,kind:'gift',recipient:'bob'},'dave');
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='dave'").get().bonus,0);
assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='dave'").get().balance,50);
assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='bob'").get().balance,bobBefore+50);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='bob'").get().bonus,150);
assert.equal((await request('gift',{coins:1,kind:'gift',recipient:'bob'},'dave')).status,400);
const welcomeCount=sqlite.prepare("SELECT count(*) n FROM ledger WHERE id='dave-welcome'").get().n;
await request('signup',{...form,name:'Dave',username:'dave'},'dave');
assert.equal(sqlite.prepare("SELECT count(*) n FROM ledger WHERE id='dave-welcome'").get().n,welcomeCount);
console.log('PASS: exactly-once 2 eCoin signup bonus, separate balances, bonus-first spending, preserved bonus restriction, mixed transfer, insufficient-funds protection.');
// Only the author can delete a post and its associated interaction records.
assert.equal((await request('post',{body:'Delete test',media:[]},'alice')).status,200);
const removable=sqlite.prepare("SELECT id FROM posts WHERE user='alice' AND body='Delete test'").get().id;
assert.equal((await request('like',{post:removable},'bob')).status,200);
assert.equal((await request('comment',{post:removable,body:'A comment'},'bob')).status,200);
assert.equal((await request('delete-post',{id:removable},'bob')).status,404);
assert.ok(sqlite.prepare('SELECT id FROM posts WHERE id=?').get(removable));
assert.equal((await request('delete-post',{id:removable},'alice')).status,200);
assert.equal(sqlite.prepare('SELECT id FROM posts WHERE id=?').get(removable),undefined);
assert.equal(sqlite.prepare('SELECT count(*) n FROM likes WHERE post=?').get(removable).n,0);
assert.equal(sqlite.prepare('SELECT count(*) n FROM comments WHERE post=?').get(removable).n,0);
console.log('PASS: post deletion requires ownership and removes interactions.');

// Profile photos upload to storage and persist on the account.
const objects=new Map();globalThis.__econectTest.env.BUCKET={async put(key,value,options){assert.ok(value instanceof ArrayBuffer);objects.set(key,{value,type:options.httpMetadata.contentType})}};
identity={userId:'alice',isAdmin:false,email:'alice@test.invalid'};
const photo=new FormData();photo.append('file',new File([new Uint8Array([255,216,255,217])],'profile.jpg',{type:'image/jpeg'}));photo.append('kind','avatar');
const uploaded=await route.POST(new Request('https://econect.test/api/upload',{method:'POST',headers:{Origin:'https://econect.test'},body:photo}));assert.equal(uploaded.status,200);const photoResult=await uploaded.json();assert.ok(objects.has(new URL('https://econect.test'+photoResult.url).searchParams.get('key')));
assert.equal((await request('profile',{avatar:photoResult.url,bio:'Hello'},'alice')).status,200);assert.equal(sqlite.prepare("SELECT avatar FROM profiles WHERE id='alice'").get().avatar,photoResult.url);
console.log('PASS: profile photo upload and saved avatar.');
// Identity changes are unique and limited atomically to once every 30 days.
assert.equal((await request('profile',{avatar:'',bio:'',name:'Alice New',surname:'Smith',username:'aliceshop'},'alice')).status,200);
assert.equal((await request('profile',{avatar:'',bio:'updated',name:'Alice New',surname:'Smith',username:'aliceshop'},'alice')).status,200);
assert.equal((await request('profile',{avatar:'',bio:'',name:'Alice Again',surname:'Smith',username:'aliceshop'},'alice')).status,429);
assert.equal((await request('profile',{avatar:'',bio:'',name:'Bob',surname:'Test',username:'ALICESHOP'},'bob')).status,400);
sqlite.prepare("UPDATE profiles SET identity_changed_at=datetime('now','-31 days') WHERE id='alice'").run();
assert.equal((await request('profile',{avatar:'',bio:'',name:'Alice Again',surname:'Smith',username:'aliceshop'},'alice')).status,200);
console.log('PASS: profile identity cooldown, case-insensitive username uniqueness, and unrestricted bio changes.');
// Voice notes charge one point and credit the conversation recipient.
for(const u of ['voicepayer','voicereceiver'])assert.equal((await request('signup',{...form,name:u,username:u},u)).status,200);
const voiceChat=(await request('chat',{recipient:'voicereceiver'},'voicepayer')).data.id;
const voiceBody={conversation:voiceChat,kind:'voice',body:'/api/media?key=private%2Fvoice',duration:60};
assert.equal((await request('message',voiceBody,'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicepayer'").get().bonus,199);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,201);
assert.equal((await request('message',{...voiceBody,duration:61},'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,203);
assert.equal((await request('message',{...voiceBody,duration:1800},'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,233);
assert.equal((await request('message',{...voiceBody,duration:1801},'voicepayer')).status,400);
assert.equal((await request('message',{...voiceBody,duration:0},'voicepayer')).status,400);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,233);
console.log('PASS: voice note minute rounding, transfers and 30-minute limit.');
// Actor-funded interactions and durable unread state.
for(const u of ['actorone','actortwo','actorpoor'])assert.equal((await request('signup',{...form,name:u,username:u},u)).status,200);
sqlite.prepare("UPDATE profiles SET balance=100,bonus=0 WHERE id IN('actorone','actortwo')").run();sqlite.prepare("UPDATE profiles SET balance=0,bonus=0 WHERE id='actorpoor'").run();
const combined=()=>sqlite.prepare("SELECT sum(balance+bonus) n FROM profiles WHERE id IN('actorone','actortwo','actorpoor')").get().n;
await request('post',{body:'Funded post',media:[]},'actorone');const fundedPost=sqlite.prepare("SELECT id FROM posts WHERE body='Funded post'").get().id;
assert.equal((await request('like',{post:fundedPost},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,96);
const repeatLike={post:fundedPost,id:crypto.randomUUID()};assert.equal((await request('like',repeatLike,'actortwo')).status,200);assert.equal((await request('like',repeatLike,'actortwo')).data.already,true);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,92);assert.equal(sqlite.prepare('SELECT count(*) n FROM likes WHERE post=?').get(fundedPost).n,2);
assert.equal((await request('like',{post:fundedPost},'actorpoor')).status,400);assert.equal(sqlite.prepare("SELECT count(*) n FROM likes WHERE user='actorpoor'").get().n,0);
assert.equal((await request('comment',{post:fundedPost,body:'Paid comment'},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,88);
assert.equal((await request('comment',{post:fundedPost,body:'No funds'},'actorpoor')).status,400);assert.equal(sqlite.prepare("SELECT count(*) n FROM comments WHERE user='actorpoor'").get().n,0);
const actorChat=(await request('chat',{recipient:'actortwo'},'actorone')).data.id;
assert.equal((await request('message',{conversation:actorChat,kind:'voice',body:'/api/media?key=private%2Fv',duration:61},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,86);
sqlite.prepare('INSERT INTO conversation_usage(conversation,user,texts) VALUES(?,?,999)').run(actorChat,'actortwo');
assert.equal((await request('message',{conversation:actorChat,kind:'text',body:'Paid text'},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,82);
assert.equal((await request('call-start',{conversation:actorChat},'actortwo')).status,200);assert.equal((await request('call-end',{conversation:actorChat},'actorone')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,78);
assert.equal((await request('call-end',{conversation:actorChat},'actortwo')).status,200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,78);
assert.equal((await request('chats',undefined,'actorone')).status,200);assert.equal((await request('unread',undefined,'actorone')).data.messages,2);
const snapshot=(await request('messages?id='+actorChat,undefined,'actorone')).data;
assert.equal((await request('unread',undefined,'actorone')).data.messages,2); // fetching alone does not clear unread
await request('message',{conversation:actorChat,kind:'text',body:'Newer than snapshot'},'actortwo');
assert.equal((await request('messages-read',{conversation:actorChat,through:snapshot.readThrough},'actorpoor')).status,404);
assert.equal((await request('messages-read',{conversation:actorChat,through:snapshot.readThrough},'actorone')).status,200);assert.equal((await request('unread',undefined,'actorone')).data.messages,1);
const notes=(await request('activity-notifications',undefined,'actorone')).data;assert.ok(notes.length>0);assert.ok((await request('unread',undefined,'actorone')).data.activity>0);
await request('activity-read',{through:notes[0].id},'actorone');assert.equal((await request('unread',undefined,'actorone')).data.activity,0);
assert.equal((await request('end-chat',{conversation:actorChat},'actorone')).data.points,0);assert.equal(combined(),200);
// Uploading a small video supplies R2 a known-size File instead of an unbounded stream.
globalThis.__econectTest.env.BUCKET={async put(key,value,options){assert.ok(value instanceof File);assert.equal(value.size,4);assert.equal(options.httpMetadata.contentType,'video/mp4')}};
identity={userId:'actorone',isAdmin:false};const videoForm=new FormData();videoForm.append('file',new File([new Uint8Array([1,2,3,4])],'clip.mp4',{type:'video/mp4'}));videoForm.append('kind','post');
assert.equal((await route.POST(new Request('https://econect.test/api/upload',{method:'POST',headers:{Origin:'https://econect.test'},body:videoForm}))).status,200);
console.log('PASS: actor-funded interactions conserve points, unread watermarks persist, and video upload uses a known-size body.');



// Original feed videos above the old 5 MB cutoff upload directly; chat keeps its smaller limit.
const larger=new File([new Uint8Array(6000000)],'original.mp4',{type:'video/mp4'});let putCount=0;
globalThis.__econectTest.env.BUCKET={async put(key,value){assert.ok(value instanceof File);assert.equal(value.size,6000000);putCount++}};
identity={userId:'actorone',isAdmin:false};const originalForm=new FormData();originalForm.append('file',larger);originalForm.append('kind','post');assert.equal((await route.POST(new Request('https://econect.test/api/upload',{method:'POST',headers:{Origin:'https://econect.test'},body:originalForm}))).status,200);assert.equal(putCount,1);
const chatForm=new FormData();chatForm.append('file',larger);chatForm.append('kind','chat');assert.equal((await route.POST(new Request('https://econect.test/api/upload',{method:'POST',headers:{Origin:'https://econect.test'},body:chatForm}))).status,400);assert.equal(putCount,1);
assert.equal((await request('post',{body:'Video with bad cover',media:[{type:'video',url:'/api/media?key=public%2Fclip',poster:'https://outside.test/image'}]},'actorone')).status,400);
// Range responses let mobile browsers seek and start uploaded video reliably.
const bytes=new Uint8Array([10,20,30,40,50,60]);let requestedRange;
globalThis.__econectTest.env.BUCKET={async head(){return{size:bytes.length,httpEtag:'"video"',writeHttpMetadata(h){h.set('Content-Type','video/mp4')}}},async get(key,options){requestedRange=options?.range;const body=requestedRange?bytes.slice(requestedRange.offset,requestedRange.offset+requestedRange.length):bytes;return{size:bytes.length,httpEtag:'"video"',body,writeHttpMetadata(h){h.set('Content-Type','video/mp4')}}}};
identity=null;
async function mediaRange(range,method='GET',key='public/video'){return route.GET(new Request('https://econect.test/api/media?key='+encodeURIComponent(key),{method,headers:range?{Range:range}:{}}))}
let ranged=await mediaRange('bytes=1-3');assert.equal(ranged.status,206);assert.equal(ranged.headers.get('Content-Range'),'bytes 1-3/6');assert.equal(ranged.headers.get('Content-Length'),'3');assert.deepEqual([...new Uint8Array(await ranged.arrayBuffer())],[20,30,40]);
ranged=await mediaRange('bytes=-2');assert.equal(ranged.status,206);assert.deepEqual([...new Uint8Array(await ranged.arrayBuffer())],[50,60]);
ranged=await mediaRange('bytes=4-');assert.equal(ranged.status,206);assert.equal(ranged.headers.get('Content-Range'),'bytes 4-5/6');
ranged=await mediaRange('bytes=99-');assert.equal(ranged.status,416);assert.equal(ranged.headers.get('Content-Range'),'bytes */6');
assert.equal((await mediaRange('bytes=0-1,3-4')).status,416);
ranged=await mediaRange(null,'HEAD');assert.equal(ranged.status,200);assert.equal(ranged.headers.get('Content-Length'),'6');assert.equal(await ranged.text(),'');
ranged=await mediaRange(null);assert.equal(ranged.status,200);assert.equal(ranged.headers.get('Accept-Ranges'),'bytes');assert.equal((await ranged.arrayBuffer()).byteLength,6);
assert.equal((await mediaRange('bytes=0-1','GET','private/video')).status,401);
console.log('PASS: video byte ranges, suffix/open ranges, seek bounds, HEAD, full video length and private media access checks.');

sqlite.close();delete globalThis.__econectTest;
