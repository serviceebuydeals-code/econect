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

sqlite.exec('UPDATE profiles SET balance=0,bonus=0');
const snapshot=()=>JSON.stringify(sqlite.prepare('SELECT id,balance,bonus FROM profiles ORDER BY id').all());const before=snapshot();const ledger=sqlite.prepare('SELECT count(*) n FROM ledger').get().n;
const chat=await request('chat',{recipient:'bob'},'alice');assert.equal(chat.status,200);const conversation=chat.data.id;
for(let n=0;n<1001;n++)assert.equal((await request('message',{conversation,kind:'text',body:'Free hello'},n%2?'bob':'alice')).status,200);
for(const user of ['alice','bob'])assert.equal((await request('message',{conversation,kind:'voice',body:'/api/media?key=private%2Fvoice',duration:1800},user)).status,200);
assert.equal((await request('message',{conversation,kind:'offer',body:'{}'},'alice')).status,200);
assert.equal((await request('call-start',{conversation},'alice')).status,200);sqlite.prepare("UPDATE messages SET body=? WHERE kind='call-start'").run(String(Date.now()-125000));assert.equal((await request('call-end',{conversation},'bob')).status,200);assert.equal((await request('call-end',{conversation},'alice')).status,200);
assert.equal((await request('call-start',{conversation},'bob')).status,200);sqlite.prepare('UPDATE conversations SET texts=5000,seconds=180 WHERE id=?').run(conversation);assert.equal((await request('end-chat',{conversation},'alice')).data.points,0);
assert.equal(snapshot(),before);assert.equal(sqlite.prepare('SELECT count(*) n FROM ledger').get().n,ledger);assert.equal(sqlite.prepare('SELECT count(*) n FROM point_transfers').get().n,0);assert.equal((await request('message',{conversation,kind:'text',body:'Closed'},'alice')).status,400);
console.log('PASS: zero-balance chat, 1,001 texts, 30-minute voice notes, call signaling, call completion/retries and active-call closure create no debits or credits; closed-chat protection remains.');
