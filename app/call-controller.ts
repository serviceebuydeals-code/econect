import {createCallPeer} from './call-peer';
type Person={id:string,name:string,username?:string,avatar?:string};
export type CallView={current:any,incoming:any,local:MediaStream|null,remote:MediaStream|null};
export function createCallController({request,media,change,error,open}:{request:(path:string,body?:any)=>Promise<any>,media:(video:boolean)=>Promise<MediaStream>,change:(state:CallView)=>void,error:(message:string)=>void,open:(conversation:string,person:Person)=>void}){
 let current:any=null,incoming:any=null,local:MediaStream|null=null,remote:MediaStream|null=null,connection:ReturnType<typeof createCallPeer>|null=null,generation=0,ready=false,after=0,disposed=false,flushing=false,failures=0,pollFailures=0,incomingBusy=false;
 let pollTimer:ReturnType<typeof setTimeout>|undefined,iceTimer:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;const outbound:RTCIceCandidateInit[]=[],dismissed=new Set<string>();
 const emit=()=>change({current:current?{...current}:null,incoming,local,remote});
 function clean(){generation++;clearTimeout(pollTimer);clearTimeout(iceTimer);clearTimeout(deadline);connection?.close();connection=null;local?.getTracks().forEach(t=>t.stop());remote?.getTracks().forEach(t=>t.stop());local=null;remote=null;current=null;ready=false;outbound.length=0;after=0;flushing=false;failures=0;pollFailures=0;emit()}
 async function hangup(){const decline=!current&&!!incoming,id=current?.id||incoming?.id;if(id)dismissed.add(id);incoming=null;clean();if(id)await request('hangup',{id,decline}).catch(()=>{})}
 function failed(message:string){void hangup();error(message)}
 function timeout(ms:number,message:string){clearTimeout(deadline);deadline=setTimeout(()=>failed(message),ms)}
 function scheduleIce(){clearTimeout(iceTimer);if(ready&&outbound.length)iceTimer=setTimeout(()=>void flushIce(),60)}
 async function flushIce(){if(!current||!ready||flushing||!outbound.length)return;const id=current.id,epoch=generation,batch=outbound.splice(0,25);flushing=true;try{await request('ice',{id,candidates:batch});failures=0}catch{if(epoch===generation){outbound.unshift(...batch);if(++failures>=3){failed('Call connection details could not be sent. Please try again.');return}}}finally{if(epoch===generation){flushing=false;if(outbound.length)iceTimer=setTimeout(()=>void flushIce(),failures?500:60)}}}
 async function poll(){if(!current||!ready||disposed)return;const id=current.id,epoch=generation;try{
  if(connection?.peer.connectionState==='connected'&&!current.connectionReported){try{await request('connected',{id});if(epoch!==generation)return;current.connectionReported=true}catch{}}
  const data=await request('poll?id='+encodeURIComponent(id)+'&after='+after);if(epoch!==generation)return;pollFailures=0;Object.assign(current,{connectedAt:data.connectedAt,meterUntil:data.meterUntil,serverNow:data.serverNow,receivedAt:Date.now(),seconds:data.seconds||0,points:data.points||0,rateHundredths:data.rateHundredths,caller:data.caller});emit();
  if(data.status==='ended'){const wasRinging=current.status==='Ringing…';dismissed.add(id);clean();if(data.endReason==='insufficient')error('The call ended because the caller has insufficient eCoin.');else if(wasRinging)error('The call was declined or was not answered.');return}
  for(const event of data.events||[]){if(epoch!==generation)return;const value=JSON.parse(event.body);
   if(event.kind==='answer'&&connection&&!connection.peer.remoteDescription){await connection.description(value);if(connection.peer.connectionState==='connected'){current.status='Connected';clearTimeout(deadline)}else{current.status='Connecting…';timeout(30000,'The call could not connect on this network. Please try again.')}emit()}
   if(event.kind==='ice'&&connection)await connection.candidate(value);
   after=Math.max(after,event.id);
  }
 }catch{if(epoch===generation&&++pollFailures>=10){failed('The call connection was lost. Please try again.');return}}
 if(epoch===generation&&current)pollTimer=setTimeout(()=>void poll(),current.status==='Connected'?1000:500);
 }
 async function setup(video:boolean,epoch:number){
  // Start device permission and connection-service lookup together, from the Answer/Call gesture.
  const streamPromise=media(video).then(stream=>{if(epoch!==generation){stream.getTracks().forEach(t=>t.stop());throw Error('Call cancelled')}local=stream;emit();return stream});
  const [config,stream]=await Promise.all([request('config'),streamPromise]);if(epoch!==generation)return null;current.relay=!!config.relay;
  const created=createCallPeer(config.iceServers,c=>{if(epoch===generation){outbound.push(c);scheduleIce()}},s=>{if(epoch===generation){remote=s;emit()}},state=>{
   if(epoch!==generation||!current)return;
   if(state==='connected'){clearTimeout(deadline);current.status='Connected';emit()}
   if(state==='disconnected'){failed('The call connection was lost. The call has ended to stop further charges.')}
   if(state==='failed')failed(current.relay?'This network could not connect the call. Try Wi-Fi or mobile data.':'This network could not connect the call. A connection relay must be configured for some mobile networks.');
  });
  connection=created;stream.getTracks().forEach(t=>created.peer.addTrack(t,stream));return created;
 }
 async function start(conversation:string,person:Person,video:boolean){
  if(current||incoming){error('End or decline the current call first.');return}
  const epoch=++generation,id=crypto.randomUUID();current={id,conversation,person,video,status:'Preparing call…'};emit();
  try{const peer=await setup(video,epoch);if(!peer||epoch!==generation)return;const offer=await peer.peer.createOffer();await peer.peer.setLocalDescription(offer);if(epoch!==generation)return;
   await request('start',{id,conversation,video,offer:{type:'offer',sdp:peer.peer.localDescription!.sdp}});if(epoch!==generation){await request('hangup',{id}).catch(()=>{});return}
   ready=true;current.status='Ringing…';emit();scheduleIce();timeout(60000,'The call was not answered.');void poll();
  }catch(e:any){if(epoch===generation){clean();void request('hangup',{id}).catch(()=>{});error(e.name==='NotAllowedError'?'Allow microphone and camera access to make calls.':e.message||'Unable to start this call.')}} 
 }
 async function answer(){
  if(!incoming||current)return;const call=incoming;incoming=null;dismissed.add(call.id);const epoch=++generation;current={id:call.id,conversation:call.conversation,person:{id:call.person_id,name:call.name,username:call.username,avatar:call.avatar},video:!!call.video,status:'Preparing call…'};open(current.conversation,current.person);emit();
  try{const peer=await setup(!!call.video,epoch);if(!peer||epoch!==generation)return;
   const data=await request('poll?id='+encodeURIComponent(call.id)+'&after=0');if(epoch!==generation)return;if(data.status!=='ringing')throw Error('This call has ended or was answered on another device.');
   const offer=data.events.find((e:any)=>e.kind==='offer');if(!offer)throw Error('The call offer is unavailable.');await peer.description(JSON.parse(offer.body));
   for(const event of data.events){if(event.kind==='ice')await peer.candidate(JSON.parse(event.body));after=Math.max(after,event.id)}
   const answer=await peer.peer.createAnswer();await peer.peer.setLocalDescription(answer);await request('answer',{id:call.id,answer:{type:'answer',sdp:peer.peer.localDescription!.sdp}});if(epoch!==generation)return;
   ready=true;if(peer.peer.connectionState==='connected'){current.status='Connected';clearTimeout(deadline)}else{current.status='Connecting…';timeout(30000,'The call could not connect on this network. Please try again.')}emit();scheduleIce();void poll();
  }catch(e:any){if(epoch===generation){const id=current?.id;clean();if(e.status!==409&&id)void request('hangup',{id}).catch(()=>{});error(e.name==='NotAllowedError'?'Allow microphone and camera access to answer.':e.message||'Unable to answer this call.')}}
 }
 async function incomingPoll(){if(incoming&&incoming.expires<=Date.now()){dismissed.add(incoming.id);incoming=null;emit()}if(disposed||current||incomingBusy||document.visibilityState!=='visible')return;incomingBusy=true;try{const rows=await request('incoming');if(disposed||current)return;const next=rows.find((r:any)=>!dismissed.has(r.id)&&r.expires>Date.now())||null;if(next?.id!==incoming?.id){incoming=next;emit()}}catch{}finally{incomingBusy=false}}
 return {start,answer,hangup,incomingPoll,dispose(){disposed=true;const id=current?.id;incoming=null;clean();if(id)void request('hangup',{id}).catch(()=>{})}};
}
