// Queue early ICE until the remote description is installed. Never discard candidates on Answer.
export function createCallPeer(servers:RTCIceServer[],onCandidate:(c:RTCIceCandidateInit)=>void,onStream:(s:MediaStream)=>void,onState:(state:RTCPeerConnectionState)=>void){
 const peer=new RTCPeerConnection({iceServers:servers,iceCandidatePoolSize:2}),pending:RTCIceCandidateInit[]=[];let closed=false,tail=Promise.resolve();const remote=new MediaStream();
 peer.onicecandidate=e=>{if(!closed&&e.candidate)onCandidate(e.candidate.toJSON())};
 peer.ontrack=e=>{if(closed){e.track.stop();return}for(const track of e.streams[0]?.getTracks()||[e.track])if(!remote.getTracks().some(t=>t.id===track.id))remote.addTrack(track);onStream(remote)};
 peer.onconnectionstatechange=()=>{if(!closed)onState(peer.connectionState)};
 function candidate(value:RTCIceCandidateInit){tail=tail.then(async()=>{if(closed)return;if(!peer.remoteDescription){pending.push(value);return}await peer.addIceCandidate(value)});return tail}
 async function description(value:RTCSessionDescriptionInit){await peer.setRemoteDescription(value);await tail;for(const c of pending.splice(0))if(!closed)await peer.addIceCandidate(c)}
 return {peer,candidate,description,close(){closed=true;pending.length=0;peer.close();remote.getTracks().forEach(t=>t.stop())}};
}
