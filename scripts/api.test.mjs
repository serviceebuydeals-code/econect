import {inlineGeography} from './test-geography.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
const db={prepare(sql){let vals=[];return{bind(...v){vals=v;return this},async first(){return sqlite.prepare(sql).get(...vals)||null},async all(){return{results:sqlite.prepare(sql).all(...vals)}},async run(){const result=sqlite.prepare(sql).run(...vals);return{success:true,meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let identity=null;globalThis.__econectTest={env:{DB:db},getAuth:async()=>identity};
let code=readFileSync('server/api.ts','utf8').replace("import{env}from'cloudflare:workers';import{getUser}from'./auth';","const env=globalThis.__econectTest.env;const getUser=globalThis.__econectTest.getAuth;");
code=code.replace("import{getCoinPrice,coinAmount}from'./pricing';",readFileSync('server/pricing.ts','utf8').replace(/export /g,''));
code=code.replace("import {youtubeVideo} from '../shared/youtube';",readFileSync('shared/youtube.ts','utf8').replace(/export /g,''));code=ts.transpileModule(inlineGeography(code),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
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
sqlite.prepare('UPDATE conversations SET texts=1000,seconds=60 WHERE id=?').run(chat.id);const settled=await request('end-chat',{conversation:chat.id},'bob');assert.equal(settled.data.points,0);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='alice'").get().balance,910);assert.equal((await request('end-chat',{conversation:chat.id},'alice')).status,400);
assert.equal((await request('admin/branding',{logo:'/api/media?key=public%2Ftest',favicon:''},'admin')).status,200);assert.equal((await request('admin/branding',{logo:'https://example.invalid',favicon:''},'admin')).status,400);
const bootstrap=(await request('bootstrap')).data;assert.ok(!('age' in bootstrap.members[0]));assert.equal(bootstrap.voters.length,1);assert.equal(bootstrap.contestants[0].id,'bob');assert.equal(bootstrap.branding.logo,'/api/media?key=public%2Ftest');
console.log('PASS: signup, access checks, duplicate likes, comment/reply points, payment confirmation, vote ranking, overdraft rollback, gifts, free conversation/privacy, branding, public field privacy.');
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
// Voice notes are free for both conversation participants.
for(const u of ['voicepayer','voicereceiver'])assert.equal((await request('signup',{...form,name:u,username:u},u)).status,200);
const voiceChat=(await request('chat',{recipient:'voicereceiver'},'voicepayer')).data.id;
const voiceBody={conversation:voiceChat,kind:'voice',body:'/api/media?key=private%2Fvoice',duration:60};
assert.equal((await request('message',voiceBody,'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicepayer'").get().bonus,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,200);
assert.equal((await request('message',{...voiceBody,duration:61},'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,200);
assert.equal((await request('message',{...voiceBody,duration:1800},'voicepayer')).status,200);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,200);
assert.equal((await request('message',{...voiceBody,duration:1801},'voicepayer')).status,400);
assert.equal((await request('message',{...voiceBody,duration:0},'voicepayer')).status,400);
assert.equal(sqlite.prepare("SELECT bonus FROM profiles WHERE id='voicereceiver'").get().bonus,200);
console.log('PASS: free voice notes and 30-minute limit.');
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
assert.equal((await request('message',{conversation:actorChat,kind:'voice',body:'/api/media?key=private%2Fv',duration:61},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,88);
sqlite.prepare('INSERT INTO conversation_usage(conversation,user,texts) VALUES(?,?,999)').run(actorChat,'actortwo');
assert.equal((await request('message',{conversation:actorChat,kind:'text',body:'Free text'},'actortwo')).status,200);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,88);
assert.equal((await request('call-start',{conversation:actorChat},'actortwo')).status,426);assert.equal((await request('call-end',{conversation:actorChat},'actorone')).status,426);assert.equal(combined(),200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,88);
assert.equal((await request('call-end',{conversation:actorChat},'actortwo')).status,426);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,88);
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
// Enforce the 30 MB feed cap before writing anything to R2.
let boundaryWrites=0;globalThis.__econectTest.env.BUCKET={async put(_key,value){assert.equal(value.size,29999999);boundaryWrites++}};
identity={userId:'actorone',isAdmin:false};for(const size of [29999999,30000000,30000001]){const form=new FormData();form.append('file',new File([new Uint8Array(size)],'clip.mp4',{type:'video/mp4'}));form.append('kind','post');const response=await route.POST(new Request('https://econect.test/api/upload',{method:'POST',headers:{Origin:'https://econect.test'},body:form}));assert.equal(response.status,size===29999999?200:400);if(size>=30000000)assert.match((await response.json()).error,/30 MB/)}assert.equal(boundaryWrites,1);
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


// YouTube posts use the normal feed/profile and conserve points on all engagement.
sqlite.prepare("UPDATE profiles SET balance=CASE WHEN id='actortwo' THEN 100 ELSE 0 END,bonus=0 WHERE id IN('actorone','actortwo','actorpoor')").run();
assert.equal((await request('post',{body:'YouTube post',media:[{type:'video',url:'https://youtu.be/dQw4w9WgXcQ?si=test',poster:'https://evil.test/x'}]},'actorone')).status,200);
const yt=sqlite.prepare("SELECT * FROM posts WHERE body='YouTube post'").get(),ytMedia=JSON.parse(yt.media)[0];assert.equal(ytMedia.provider,'youtube');assert.equal(ytMedia.url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');assert.equal(ytMedia.poster,'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
assert.ok((await request('bootstrap',undefined,'actortwo')).data.posts.some(p=>p.id===yt.id));assert.ok((await request('profile?id=actorone',undefined,'actortwo')).data.posts.some(p=>p.id===yt.id));
for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://youtube.com/watch?v=bad'])assert.equal((await request('post',{body:'Invalid',media:[{type:'video',provider:'youtube',url}]},'actorone')).status,400);
const ytLike={post:yt.id,id:crypto.randomUUID()};assert.equal((await request('like',ytLike,'actortwo')).status,200);assert.equal((await request('like',ytLike,'actortwo')).data.already,true);assert.equal((await request('like',{post:yt.id,id:crypto.randomUUID()},'actortwo')).status,200);
assert.equal((await request('comment',{post:yt.id,body:'YouTube comment'},'actortwo')).status,200);const ytComment=sqlite.prepare('SELECT id FROM comments WHERE post=?').get(yt.id);assert.equal((await request('comment',{post:yt.id,parent:ytComment.id,body:'YouTube reply'},'actortwo')).status,200);
assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actorone'").get().balance,40);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,60);assert.equal(combined(),100);
const count=sqlite.prepare('SELECT count(*) n FROM comments WHERE post=?').get(yt.id).n;assert.equal((await request('comment',{post:yt.id,body:'No funds'},'actorpoor')).status,400);assert.equal(sqlite.prepare('SELECT count(*) n FROM comments WHERE post=?').get(yt.id).n,count);assert.equal((await request('like',{post:yt.id},'actorpoor')).status,400);assert.equal(combined(),100);
assert.equal((await request('like',{post:yt.id},'actorone')).status,200);assert.equal((await request('comment',{post:yt.id,body:'My video'},'actorone')).status,200);assert.equal(combined(),100);

assert.equal((await request('post',{body:'Photo points post',media:[{type:'image',url:'/api/media?key=public%2Fphoto'}]},'actorone')).status,200);const photoPost=sqlite.prepare("SELECT id FROM posts WHERE body='Photo points post'").get().id;
assert.equal((await request('like',{post:photoPost,id:crypto.randomUUID()},'actortwo')).status,200);assert.equal((await request('comment',{post:photoPost,body:'Photo comment'},'actortwo')).status,200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actorone'").get().balance,60);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,40);assert.equal(combined(),100);

assert.equal((await request('post',{body:'Stream video points',media:[{type:'video',url:'/api/media?key=public%2Flegacy-video'}]},'actorone')).status,200);const streamPost=sqlite.prepare("SELECT id FROM posts WHERE body='Stream video points'").get().id;assert.equal((await request('like',{post:streamPost},'actortwo')).status,200);assert.equal((await request('comment',{post:streamPost,body:'Stream video comment'},'actortwo')).status,200);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actorone'").get().balance,80);assert.equal(sqlite.prepare("SELECT balance FROM profiles WHERE id='actortwo'").get().balance,20);assert.equal(combined(),100);
console.log('PASS: restored uploaded-video posts retain 10-point likes and comments.');
console.log('PASS: photo post likes and comments transfer exactly 10 points each with no extra points.');
console.log('PASS: YouTube feed/profile posts, canonical thumbnails, URL rejection, repeat likes, retry protection, exact 10-point likes/comments/replies, insufficient-funds rollback and no self-credit.');


// Gift attribution is recipient-scoped and does not change settlement.
for(const [user,username] of [['gift-giver','gift_giver'],['gift-receiver','gift_receiver']])assert.equal((await request('signup',{...form,name:user,username},user)).status,200);
sqlite.prepare("UPDATE profiles SET balance=75,bonus=25 WHERE id='gift-giver'").run();
const giftTotal=sqlite.prepare('SELECT sum(balance+bonus) n FROM profiles').get().n;
assert.equal((await request('gift',{coins:1,kind:'gift',recipient:'gift-receiver'},'gift-giver')).status,200);
assert.equal(sqlite.prepare('SELECT sum(balance+bonus) n FROM profiles').get().n,giftTotal);
let receipt=(await request('wallet',undefined,'gift-receiver')).data.ledger.filter(l=>l.label.startsWith('eCoin gift'));
assert.equal(receipt.length,2);assert.ok(receipt.every(l=>l.gift_sender_username==='gift_giver'));assert.equal(receipt.reduce((n,l)=>n+l.points,0),100);
let notices=(await request('activity-notifications',undefined,'gift-receiver')).data.filter(n=>n.gift_sender_username);
assert.equal(notices.length,2);assert.ok(notices.every(n=>n.gift_sender_username==='gift_giver'));
assert.equal((await request('wallet',undefined,'gift-giver')).data.ledger.filter(l=>l.gift_sender_username).length,0);
sqlite.prepare("UPDATE profiles SET username='gift_giver_new' WHERE id='gift-giver'").run();
assert.ok((await request('wallet',undefined,'gift-receiver')).data.ledger.filter(l=>l.label.startsWith('eCoin gift')).every(l=>l.gift_sender_username==='gift_giver_new'));
const bankGift=await request('payment',{coins:2,kind:'gift',recipient:'gift-receiver'},'gift-giver');assert.equal(bankGift.status,200);
assert.equal((await request('admin/payment',{id:bankGift.data.id},'admin')).status,200);
receipt=(await request('wallet',undefined,'gift-receiver')).data.ledger.find(l=>l.id===bankGift.data.id);assert.equal(receipt.gift_sender_username,'gift_giver_new');
const topup=await request('payment',{coins:1,kind:'topup',recipient:'gift-receiver'},'gift-receiver');assert.equal(topup.status,200);await request('admin/payment',{id:topup.data.id},'admin');
assert.equal((await request('wallet',undefined,'gift-receiver')).data.ledger.find(l=>l.id===topup.data.id).gift_sender_username,null);
console.log('PASS: received wallet gifts expose sender usernames in both balance buckets and notifications, remain private to the recipient, conserve points, follow username changes, attribute confirmed bank gifts and exclude top-ups.');


// One visible thread per person, preserved history and recipient read receipts.
for(const [user,username] of [['thread-a','thread_a'],['thread-b','thread_b'],['wallet-history','wallet_history']])assert.equal((await request('signup',{...form,name:user,username},user)).status,200);
const thread=(await request('chat',{recipient:'thread-b'},'thread-a')).data.id;
await request('message',{conversation:thread,kind:'text',body:'first read receipt'},'thread-a');
let outgoing=(await request('messages?id='+thread,undefined,'thread-a')).data;
assert.equal(outgoing.messages.at(-1).seen,0);await request('messages-read',{conversation:thread,through:outgoing.readThrough},'thread-a');
assert.equal((await request('messages?id='+thread,undefined,'thread-a')).data.messages.at(-1).seen,0,'reading your own messages is not recipient Seen');
await request('messages-read',{conversation:thread,through:outgoing.readThrough},'thread-b');
assert.equal((await request('messages?id='+thread,undefined,'thread-a')).data.messages.at(-1).seen,1);
sqlite.prepare("INSERT INTO conversations(id,starter,recipient,status,created) VALUES('legacy-thread','thread-b','thread-a','active','2000-01-01 00:00:00')").run();
sqlite.prepare("INSERT INTO messages(id,conversation,sender,kind,body) VALUES('legacy-message','legacy-thread','thread-a','text','History from the old thread')").run();
sqlite.prepare("UPDATE conversations SET status='ended' WHERE id='legacy-thread'").run();
await request('message',{conversation:thread,kind:'text',body:'New unread message'},'thread-a');
let list=(await request('chats',undefined,'thread-b')).data.filter(c=>c.starter==='thread-a'||c.recipient==='thread-a');
assert.equal(list.length,1);assert.equal(list[0].id,thread);assert.equal(list[0].unread_count,2);
outgoing=(await request('messages?id=legacy-thread',undefined,'thread-a')).data;
assert.equal(outgoing.conversation.id,thread);assert.equal(outgoing.messages.length,3);assert.equal(outgoing.messages.find(m=>m.id==='legacy-message').seen,0);
await request('messages-read',{conversation:thread,through:outgoing.readThrough},'thread-b');
assert.ok((await request('messages?id='+thread,undefined,'thread-a')).data.messages.every(m=>m.seen===1));
assert.equal((await request('messages?id='+thread,undefined,'carol')).status,404);
assert.equal((await request('messages-read',{conversation:thread,through:outgoing.readThrough},'carol')).status,404);
await request('end-chat',{conversation:thread},'thread-a');
const resumed=await Promise.all([request('chat',{recipient:'thread-b'},'thread-a'),request('chat',{recipient:'thread-a'},'thread-b')]);
assert.ok(resumed.every(r=>r.data.id===thread));assert.equal(sqlite.prepare("SELECT count(*) n FROM conversations WHERE starter IN('thread-a','thread-b') AND recipient IN('thread-a','thread-b')").get().n,2,'no new thread after ending/restarting or racing starts');
sqlite.prepare("UPDATE conversations SET status='active' WHERE id='legacy-thread'").run();
await request('end-chat',{conversation:thread},'thread-a');
assert.equal(sqlite.prepare("SELECT count(*) n FROM conversations WHERE starter IN('thread-a','thread-b') AND recipient IN('thread-a','thread-b') AND status='active'").get().n,0);
for(let i=0;i<125;i++)sqlite.prepare('INSERT INTO ledger(id,user,points,label) VALUES(?,?,?,?)').run('wallet-history-'+i,'wallet-history',1,'History '+i);
const summary=(await request('wallet',undefined,'wallet-history')).data;
assert.equal(summary.ledger.length,10);assert.equal(summary.ledger[0].id,'wallet-history-124');
let offset=0,allRows=[];do{const response=await request('wallet-activity?offset='+offset,undefined,'wallet-history');assert.equal(response.status,200);allRows.push(...response.data.rows);offset=response.data.next}while(offset!==null);
assert.equal(allRows.length,126);assert.equal(new Set(allRows.map(l=>l.id)).size,126);assert.ok(allRows.every(l=>l.user==='wallet-history'));
assert.equal((await request('wallet-activity',undefined,null)).status,401);
console.log('PASS: ended/active legacy threads combine without data loss, per-thread read receipts remain accurate, outsiders are blocked, restart/race creates no duplicates, ending closes the whole pair, wallet shows newest 10 and private history paginates beyond 100.');


for(const [user,username] of [['actor-poster','actor_poster'],['actor-payer','actor_payer']])assert.equal((await request('signup',{...form,name:user,username},user)).status,200);
sqlite.prepare("UPDATE profiles SET balance=100,bonus=5 WHERE id='actor-payer'").run();
await request('post',{body:'Actor attribution photo',media:[{type:'image',url:'/api/media?key=public/actor-photo'}]},'actor-poster');
const actorPost=sqlite.prepare("SELECT id FROM posts WHERE user='actor-poster'").get().id,actorTotal=sqlite.prepare('SELECT sum(balance+bonus) n FROM profiles').get().n;
await request('like',{post:actorPost,id:crypto.randomUUID()},'actor-payer');
await request('comment',{post:actorPost,body:'Named sender comment'},'actor-payer');
assert.equal(sqlite.prepare('SELECT sum(balance+bonus) n FROM profiles').get().n,actorTotal);
const actorCredits=(await request('wallet',undefined,'actor-poster')).data.ledger.filter(l=>l.points>0&&['Post liked','New comment on your post'].includes(l.label));
assert.equal(actorCredits.length,3,'like spanning bonus and withdrawable buckets plus regular comment');assert.equal(actorCredits.reduce((n,l)=>n+l.points,0),20);
assert.ok(actorCredits.every(l=>l.actor_id==='actor-payer'&&l.actor_username==='actor_payer'&&l.gift_sender_username===null));
const actorDebits=(await request('wallet-activity',undefined,'actor-payer')).data.rows.filter(l=>l.points<0);
assert.ok(actorDebits.every(l=>l.actor_id==='actor-poster'&&l.actor_username==='actor_poster'));
const giftActors=(await request('wallet-activity',undefined,'gift-receiver')).data.rows.filter(l=>l.gift_sender_username);
assert.ok(giftActors.length>=3);assert.ok(giftActors.every(l=>l.actor_id==='gift-giver'&&l.actor_username==='gift_giver_new'));
assert.equal((await request('wallet',undefined,'carol')).data.ledger.some(l=>l.actor_id==='actor-payer'),false);
console.log('PASS: likes/comments identify the real payer in both balance buckets, sent entries identify the recipient, wallet/direct gifts provide clickable sender IDs, other accounts cannot see these receipts, and points remain conserved.');


const fractionalId=crypto.randomUUID();sqlite.exec("INSERT INTO conversations(id,starter,recipient) VALUES('fractional-chat','actor-payer','actor-poster')");
sqlite.prepare("INSERT INTO rtc_calls(id,conversation,caller,recipient,video,created,expires,caller_seen,rate_hundredths) VALUES(?,'fractional-chat','actor-payer','actor-poster',0,?,?,?,4)").run(fractionalId,Date.now(),Date.now()+60000,Date.now());
sqlite.prepare("UPDATE rtc_calls SET billed_seconds=5,charged_hundredths=20 WHERE id=?").run(fractionalId);
const fractionalCredits=(await request('wallet-activity',undefined,'actor-poster')).data.rows.filter(l=>l.label==='Audio call');
const fractionalDebits=(await request('wallet-activity',undefined,'actor-payer')).data.rows.filter(l=>l.label==='Audio call');
assert.equal(Math.round(fractionalCredits.reduce((n,l)=>n+l.points,0)*100),20);
assert.equal(Math.round(fractionalDebits.reduce((n,l)=>n+l.points,0)*100),-20);
assert.ok(fractionalCredits.every(l=>l.actor_id==='actor-payer'&&l.actor_username==='actor_payer'));
assert.ok(fractionalDebits.every(l=>l.actor_id==='actor-poster'&&l.actor_username==='actor_poster'));
const fractionalLedger=sqlite.prepare('SELECT count(*) n FROM ledger').get().n;
assert.throws(()=>sqlite.prepare("UPDATE rtc_calls SET billed_seconds=100000,charged_hundredths=400000 WHERE id=?").run(fractionalId),/Insufficient/);
assert.equal(sqlite.prepare('SELECT charged_hundredths FROM rtc_calls WHERE id=?').get(fractionalId).charged_hundredths,20);
assert.equal(sqlite.prepare('SELECT count(*) n FROM ledger').get().n,fractionalLedger,'an overdrawn charge rolls back both wallet entries and the call meter');
console.log('PASS: fractional calls debit and credit exactly 0.2 points, keep clickable wallet counterparties, and roll back overdrafts atomically.');

// Private mailbox objects can never be fetched through chat/public media endpoints,
 // even if a member forges a matching message in their own conversation.
const mailKey='private/admin-mail/test/original.eml',mailURL='/api/media?key='+encodeURIComponent(mailKey)+'&conversation='+actorChat;
sqlite.prepare("UPDATE conversations SET status='active' WHERE id=?").run(actorChat);
sqlite.prepare("INSERT INTO messages(id,conversation,sender,kind,body) VALUES('mail-probe',?,'actortwo','text',?)").run(actorChat,mailURL);
assert.equal((await request('media?key='+encodeURIComponent(mailKey)+'&conversation='+actorChat,undefined,'actortwo')).status,403);

// International registrations retain their own country, region and city.
for(const [user,country,state,city] of [['french','FR','Île-de-France','Paris'],['indian','India','Maharashtra','Mumbai'],['kenyan','KE','Nairobi','Nairobi'],['vatican','VA','','Vatican City']]){
 const response=await request('signup',{...form,name:user,username:user,country,state,city,originCountry:country,originState:state},user);assert.equal(response.status,200,JSON.stringify(response.data));const profile=sqlite.prepare('SELECT country,state,city FROM profiles WHERE id=?').get(user);assert.equal(profile.city,city);assert.notEqual(profile.country,'Nigeria');assert.ok(profile.state);
}
assert.equal((await request('signup',{...form,name:'Bad',username:'invalidcountry',country:'not-a-country'},'invalidcountry')).status,400);
console.log('PASS: international signup uses canonical countries and local cities, including countries without subdivisions.');

sqlite.close();delete globalThis.__econectTest;
