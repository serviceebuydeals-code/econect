export function createCallRing(){
 let audio:AudioContext|null=null,timer:ReturnType<typeof setInterval>|undefined;const playing=new Set<OscillatorNode>();
 async function unlock(){try{const C=window.AudioContext||(window as any).webkitAudioContext;if(!C)return false;audio??=new C();await audio!.resume();return audio!.state==='running'}catch{return false}}
 function stop(){if(timer)clearInterval(timer);timer=undefined;for(const o of playing){try{o.stop()}catch{}o.disconnect()}playing.clear();try{navigator.vibrate?.(0)}catch{}}
 function start(incoming:boolean){stop();const play=()=>{if(audio?.state!=='running')return;const t=audio.currentTime;for(const f of [440,480]){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.07,t+.02);g.gain.setValueAtTime(.07,t+(incoming?1.1:.7));g.gain.linearRampToValueAtTime(0,t+(incoming?1.2:.8));o.connect(g);g.connect(audio.destination);playing.add(o);o.onended=()=>{playing.delete(o);o.disconnect();g.disconnect()};o.start(t);o.stop(t+(incoming?1.25:.85))}if(incoming)try{navigator.vibrate?.([600,200,600])}catch{}};play();timer=setInterval(play,incoming?3000:4000)}
 return {unlock,start,stop,dispose(){stop();void audio?.close().catch(()=>{});audio=null}};
}
