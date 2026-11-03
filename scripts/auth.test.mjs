import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import ts from'typescript';import assert from'node:assert/strict';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0003_independent_auth.sql','utf8'));const db={prepare(query){let args=[];return{bind(...a){args=a;return this},async first(){return sql.prepare(query).get(...args)||null},async run(){sql.prepare(query).run(...args);return{success:true}}}},async batch(a){sql.exec('BEGIN');try{for(const s of a)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
globalThis.__authEnv={DB:db,ADMIN_EMAIL:'owner@example.test',ADMIN_SETUP_KEY:'test-only-owner-setup-key'};
let source=readFileSync('server/auth.ts','utf8').replace("import{env}from'cloudflare:workers';",'const env=globalThis.__authEnv;');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;const auth=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function req(path,body,headers={}){return auth.authRoute(new Request('https://econect.test/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://econect.test','cf-connecting-ip':'192.0.2.1',...headers},body:JSON.stringify(body)}),path)}
const password='A long test-only password!';let r=await req('register',{email:'owner@example.test',password});assert.equal(r.status,403);r=await req('register',{email:'owner@example.test',password,adminKey:'test-only-owner-setup-key'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.equal((await auth.getUser(new Request('https://econect.test',{headers:{cookie}}))).isAdmin,true);
assert.equal(await auth.getUser(new Request('https://econect.test',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'owner@example.test'}})),null);
r=await req('register',{email:'alice@example.test',password});assert.equal(r.status,200);assert.equal((await req('register',{email:'alice@example.test',password})).status,400);assert.equal((await req('login',{email:'alice@example.test',password:'wrong'})).status,401);assert.equal((await req('login',{email:'alice@example.test',password})).status,200);assert.equal((await req('login',{email:'alice@example.test',password},{Origin:'https://evil.invalid'})).status,403);
const alice=sql.prepare("SELECT * FROM auth_users WHERE email='alice@example.test'").get();assert.notEqual(alice.password_hash,password);assert.equal(alice.is_admin,0);
const raw='a'.repeat(64);sql.prepare('INSERT INTO auth_reset_tokens(token_hash,user_id,expires) VALUES(?,?,?)').run(await auth.digest(raw),alice.id,Date.now()+100000);assert.equal((await req('reset',{token:raw,password:'A completely new test password!'})).status,200);assert.equal((await req('reset',{token:raw,password:'Another long test password!'})).status,400);assert.equal((await req('login',{email:'alice@example.test',password})).status,401);assert.equal((await req('login',{email:'alice@example.test',password:'A completely new test password!'})).status,200);
assert.equal((await req('forgot',{email:'alice@example.test'})).status,503);
// Capture reset emails locally; no messages are sent to a real provider.
sql.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE)');
sql.prepare('INSERT INTO profiles(id,username) VALUES(?,?)').run(alice.id,'AliceName');
Object.assign(globalThis.__authEnv,{RESEND_API_KEY:'test-only-key',EMAIL_FROM:'eConect <noreply@example.test>',APP_ORIGIN:'https://econect.test'});
const originalFetch=globalThis.fetch,sent=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(options.body));return Response.json({id:'mock-email'})};
for(const body of [{email:' ALICE@EXAMPLE.TEST '},{identifier:' AliceName '},{identifier:'@ALICENAME'}]){r=await req('forgot',body);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true})}
assert.equal(sent.length,3);for(const message of sent){assert.equal(message.to,'alice@example.test');assert.match(message.text,/https:\/\/econect\.test\/\?reset=[a-f0-9]{64}/);assert.equal(message.text.includes('@ALICENAME'),false)}
// Switching between username and email cannot bypass the account's reset limit.
assert.equal((await req('forgot',{identifier:'ALICE@EXAMPLE.TEST'})).status,200);assert.equal(sent.length,3);
for(const identifier of ['missinguser','missing@example.test',"alice' OR 1=1 --"]){const response=await req('forgot',{identifier});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true})}assert.equal(sent.length,3);
for(const identifier of ['', '@', 'a'.repeat(255)])assert.equal((await req('forgot',{identifier})).status,400);
// Email recovery also works before a member has created their profile.
assert.equal((await req('forgot',{identifier:'OWNER@EXAMPLE.TEST'})).status,200);assert.equal(sent.at(-1).to,'owner@example.test');
const issued=new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('reset');assert.ok(sql.prepare('SELECT token_hash FROM auth_reset_tokens WHERE token_hash=?').get(await auth.digest(issued)));
assert.equal((await req('reset',{token:issued,password:'Recovered with username password!'})).status,200);assert.equal((await req('reset',{token:issued,password:'Recovered with username password!'})).status,400);
assert.equal((await req('login',{email:'alice@example.test',password:'Recovered with username password!'})).status,200);
globalThis.fetch=originalFetch;
console.log('PASS: email and case-insensitive username/@username recovery sends only to the registered email, preserves generic responses, limits aliases per account, and issues working single-use reset links (email provider simulated).');
await req('logout',{}, {cookie});assert.equal(await auth.getUser(new Request('https://econect.test',{headers:{cookie}})),null);
for(let i=0;i<11;i++)r=await req('login',{email:'limited@example.test',password:'wrong'});assert.equal(r.status,429);
console.log('PASS: independent registration/login, secure session cookies, forged identity rejection, protected admin setup, password hashing/reset, session revocation, CSRF checks, and login throttling.');sql.close();delete globalThis.__authEnv;
