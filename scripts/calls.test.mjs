import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
let peerCount=0;const instances=[];globalThis.MediaStream=class{tracks=[];getTracks(){return this.tracks}addTrack(t){this.tracks.push(t)}};
globalThis.RTCPeerConnection=class{constructor(){peerCount++;instances.push(this);this.remoteDescription=null;this.connectionState='new';this.added=[]}async setRemoteDescription(v){this.remoteDescription=v;if(v.type==='answer'){this.connectionState='connected';this.onconnectionstatechange?.()}}addTrack(){}async createOffer(){return{type:'offer',sdp:'local-offer'}}async createAnswer(){return{type:'answer',sdp:'local-answer'}}async setLocalDescription(v){this.localDescription=v;this.onicecandidate?.({candidate:{toJSON:()=>({candidate:'local-early'})}})}async addIceCandidate(c){assert.ok(this.remoteDescription,'ICE may not be added before the remote description');this.added.push(c)}close(){this.closed=true}};
const {createCallPeer}=await load(readFileSync('app/call-peer.ts','utf8'));let stream;const peer=createCallPeer([],()=>{},s=>stream=s,()=>{});
await peer.candidate({candidate:'early-one'});await peer.candidate({candidate:'early-two'});assert.equal(peer.peer.added.length,0);
await peer.description({type:'offer',sdp:'offer'});assert.deepEqual(peer.peer.added.map(c=>c.candidate),['early-one','early-two']);await peer.candidate({candidate:'after-answer'});assert.equal(peer.peer.added.length,3);peer.peer.ontrack({streams:[],track:{id:'audio',stop(){}}});assert.equal(stream.getTracks().length,1);peer.close();assert.equal(peer.peer.closed,true);

globalThis.__callPeer=createCallPeer;
const {createCallController}=await load(readFileSync('app/call-controller.ts','utf8').replace("import {createCallPeer} from './call-peer';","const createCallPeer=globalThis.__callPeer;"));
const operations=[],views=[];let localStopped=0;
const media=()=>{const s=new MediaStream();s.addTrack({id:'local-audio',stop(){localStopped++}});return Promise.resolve(s)};
let gotAnswer=false;const controller=createCallController({request:async(path,body)=>{operations.push(path.split('?')[0]);if(path==='config')return{iceServers:[],relay:true};if(path.startsWith('poll')){if(gotAnswer)return{status:'active',events:[]};gotAnswer=true;return{status:'active',events:[{id:1,kind:'ice',body:JSON.stringify({candidate:'before-answer'})},{id:2,kind:'answer',body:JSON.stringify({type:'answer',sdp:'remote-answer'})}]}}return{ok:true}},media,change:s=>views.push(s),error:message=>{throw Error(message)},open(){}});
await controller.start('conversation',{id:'bob',name:'Bob'},false);await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(views.at(-1).current.status,'Connected','connected state is not overwritten by a late answer completion');
assert.equal(instances.at(-1).added[0].candidate,'before-answer');assert.ok(operations.indexOf('start')<operations.indexOf('ice'),'local candidates wait until the call exists');
await controller.hangup();assert.ok(localStopped>0);assert.equal(views.at(-1).current,null);controller.dispose();
let resolveMedia,lateStopped=0;const cancel=createCallController({request:async()=>({iceServers:[],relay:false}),media:()=>new Promise(resolve=>resolveMedia=resolve),change(){},error(){},open(){}});
const pending=cancel.start('conversation',{id:'bob',name:'Bob'},false);await cancel.hangup();const lateStream=new MediaStream();lateStream.addTrack({id:'late-mic',stop(){lateStopped++}});resolveMedia(lateStream);await pending;assert.equal(lateStopped,1,'permission resolving after cancellation releases the microphone');cancel.dispose();


globalThis.document={visibilityState:'visible'};const incomingViews=[];let incomingRequests=0;const incomingRow={id:'incoming-test',conversation:'conversation',person_id:'bob',name:'Bob',expires:Date.now()+60000};
const expiration=createCallController({request:async()=>{if(incomingRequests++)throw Error('offline');return[incomingRow]},media,change:v=>incomingViews.push(v),error(){},open(){}});
await expiration.incomingPoll();assert.equal(incomingViews.at(-1).incoming.id,'incoming-test');incomingRow.expires=Date.now()-1;await expiration.incomingPoll();assert.equal(incomingViews.at(-1).incoming,null,'ringing expires locally even when the next network poll fails');expiration.dispose();

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
const db={prepare(sql){let values=[];return{bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}}},async batch(rows){sqlite.exec('BEGIN');try{const result=[];for(const row of rows)result.push(await row.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
for(const user of ['alice','bob','carol'])sqlite.prepare('INSERT INTO profiles(id,username,name,surname,age,country,state,city,origin_country,origin_state) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user,user,user,'Test',25,'NG','Lagos','Lagos','NG','Lagos');
sqlite.exec("INSERT INTO conversations(id,starter,recipient) VALUES('conversation','alice','bob'),('other','alice','carol'); INSERT INTO push_subscriptions(id,user,endpoint,p256dh,auth,created) VALUES('device','bob','https://fcm.googleapis.com/test','public','auth',0)");
let identity=null;globalThis.__callsAuth=async()=>identity;
const route=await load(readFileSync('server/calls.ts','utf8').replace("import {getUser} from './auth';","const getUser=globalThis.__callsAuth;"));
const env={DB:db};async function request(path,body,user='alice',origin='https://econect.test'){identity=user?{userId:user}:null;const response=await route.callsRoute(new Request('https://econect.test/api/calls/'+path,body?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env);return{status:response.status,data:await response.json()}}
assert.equal((await request('config',null,null)).status,401);assert.equal((await request('config')).data.relay,false);
const id=crypto.randomUUID(),offer={type:'offer',sdp:'session-offer'};
assert.equal((await request('start',{id,conversation:'conversation',offer},'alice','https://bad.test')).status,403);
assert.equal((await request('start',{id,conversation:'conversation',video:true,offer})).status,200);assert.equal((await request('start',{id,conversation:'conversation',offer})).status,200);
assert.equal(sqlite.prepare('SELECT count(*) n FROM rtc_calls').get().n,1);assert.equal(sqlite.prepare('SELECT source FROM push_deliveries').get().source,'rtc:'+id);
assert.equal((await request('incoming',null,'bob')).data[0].person_id,'alice');assert.equal((await request('incoming')).data.length,0);
assert.equal((await request('poll?id='+id,null,'carol')).status,404);assert.equal((await request('ice',{id,candidates:[{candidate:'candidate-early',sdpMid:'0',sdpMLineIndex:0}]})).status,200);
let response=await request('poll?id='+id,null,'bob');assert.deepEqual(response.data.events.map(e=>e.kind),['offer','ice']);const last=response.data.events.at(-1).id;
assert.equal((await request('answer',{id,answer:{type:'answer',sdp:'answer'}},'alice')).status,403);
assert.equal((await request('answer',{id,answer:{type:'answer',sdp:'answer'}},'bob')).status,200);assert.equal((await request('answer',{id,answer:{type:'answer',sdp:'answer'}},'bob')).status,409);
assert.equal(sqlite.prepare("SELECT count(*) n FROM rtc_signals WHERE kind='answer'").get().n,1);assert.equal((await request('hangup',{id,decline:true},'bob')).status,200);assert.equal(sqlite.prepare('SELECT status FROM rtc_calls WHERE id=?').get(id).status,'active','a stale notification cannot decline a call answered on another device');
response=await request('poll?id='+id);assert.deepEqual(response.data.events.map(e=>e.kind),['answer']);assert.equal((await request('poll?id='+id+'&after='+last,null,'bob')).data.events.length,0);
assert.equal((await request('start',{id:crypto.randomUUID(),conversation:'other',offer})).status,409);
assert.equal((await request('hangup',{id},'carol')).status,404);assert.equal((await request('hangup',{id},'bob')).status,200);assert.equal((await request('hangup',{id},'bob')).status,200);assert.equal((await request('poll?id='+id)).data.status,'ended');assert.equal((await request('incoming',null,'bob')).data.length,0);
const second=crypto.randomUUID();assert.equal((await request('start',{id:second,conversation:'conversation',offer})).status,200);sqlite.prepare('UPDATE rtc_calls SET expires=? WHERE id=?').run(Date.now()-1,second);assert.equal((await request('poll?id='+second)).data.status,'ended');assert.equal((await request('answer',{id:second,answer:{type:'answer',sdp:'answer'}},'bob')).status,410);
assert.equal(sqlite.prepare('SELECT count(*) n FROM ledger').get().n,0,'calls remain free');
let provider=0;globalThis.fetch=async(url,options)=>{provider++;assert.ok(url.endsWith('/credentials/generate-ice-servers'));assert.equal(options.headers.Authorization,'Bearer private-key');assert.equal(JSON.parse(options.body).ttl,86400);return Response.json({iceServers:[{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'temporary',credential:'short-lived'}]})};
env.TURN_KEY_ID='key-id';env.TURN_API_TOKEN='private-key';const config=await request('config');assert.equal(config.data.relay,true);assert.equal(provider,1);assert.equal(JSON.stringify(config.data).includes('private-key'),false);sqlite.close();
console.log('PASS: early ICE survives Answer; streamless audio tracks play; call authorization, one-answer claims, busy checks, separate event cursors, caller push, expiry, hangup and ephemeral TURN credentials work; calls charge no points.');
