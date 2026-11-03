import {useEffect,useRef,useState} from 'react';
import {Play,Volume2,VolumeX,Maximize2,RotateCw} from 'lucide-react';
export function PostVideo({src,poster,full=false,onOpen}:{src:string,poster?:string,full?:boolean,onOpen?:()=>void}){
 const video=useRef<HTMLVideoElement>(null),manual=useRef(false),visible=useRef(false),id=useRef(crypto.randomUUID());
 const [playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[wanted,setWanted]=useState(full),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const parsed=new URL(src,location.origin),stream=parsed.origin===location.origin&&parsed.pathname==='/api/media'&&(parsed.searchParams.get('key')||'').includes('/stream/');
 useEffect(()=>{
  const v=video.current;if(!v||!stream||!wanted)return;
  const controller=new AbortController();let cleanup:(()=>void)|undefined,active=true;
  setError(false);
  (async()=>{
   try{
    const response=await fetch('/api/stream/play?'+parsed.searchParams.toString(),{signal:controller.signal});const data:any=await response.json();
    if(!response.ok)throw Error('Video unavailable.');
    if(!/^https:\/\/videodelivery\.net\/[a-zA-Z0-9._-]+\/manifest\/video\.m3u8$/.test(data.url))throw Error('Invalid video.');
    if(!active)return;
    if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=data.url;v.load()}
    else{const {attachHls}=await import('./hls-playback');if(active)cleanup=attachHls(v,data.url,()=>setError(true))}
   }catch(e:any){if(active&&e.name!=='AbortError')setError(true)}
  })();
  return()=>{active=false;controller.abort();cleanup?.();v.removeAttribute('src');v.load()};
 },[src,stream,wanted,retry]);
 useEffect(()=>{
  const v=video.current;if(!v)return;
  const observer=new IntersectionObserver(entries=>{const entry=entries[0];visible.current=entry.isIntersecting&&entry.intersectionRatio>=.55;if(visible.current){setWanted(true);if(!manual.current&&document.visibilityState==='visible')v.play().catch(()=>{})}else v.pause()},{threshold:[0,.55,1]});observer.observe(v);
  const other=(e:Event)=>{if((e as CustomEvent).detail!==id.current)v.pause()},visibility=()=>{if(document.visibilityState!=='visible')v.pause();else if(visible.current&&!manual.current)v.play().catch(()=>{})};
  window.addEventListener('econect-video-playing',other);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();window.removeEventListener('econect-video-playing',other);document.removeEventListener('visibilitychange',visibility);v.pause()};
 },[src]);
 function toggleSound(){const v=video.current;if(!v)return;const next=!v.muted;v.muted=next;v.volume=1;setMuted(next);if(!next){manual.current=false;void v.play().catch(()=>setPlaying(false))}}
 function toggle(){const v=video.current;if(!v)return;setWanted(true);if(v.paused){manual.current=false;v.play().catch(()=>{})}else{manual.current=true;v.pause()}}
 return <div className={'post-video-player '+(full?'full-video':'')}>
  <video ref={video} src={stream?undefined:src} poster={poster} muted={muted} playsInline preload="metadata" loop tabIndex={0} role="button" aria-label={playing?'Pause video':'Play video'} onClick={toggle} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();toggle()}}} onCanPlay={()=>{if(visible.current&&!manual.current&&document.visibilityState==='visible')video.current?.play().catch(()=>{})}} onPlay={()=>{setPlaying(true);window.dispatchEvent(new CustomEvent('econect-video-playing',{detail:id.current}))}} onPause={()=>setPlaying(false)} onVolumeChange={e=>setMuted(e.currentTarget.muted)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onError={()=>{if(stream)setError(true)}}/>
  {!playing&&!error&&<span className="post-video-paused" aria-hidden="true"><Play size={30}/></span>}
  {error&&<button className="post-video-retry secondary" onClick={()=>{setWanted(true);setRetry(n=>n+1)}}><RotateCw size={16}/> Retry video</button>}
  <button className="post-video-sound" aria-label={muted?'Unmute video':'Mute video'} onClick={toggleSound}>{muted?<><VolumeX size={18}/><span>Tap for sound</span></>:<Volume2 size={18}/>}</button>
  {onOpen&&<button className="post-video-expand" aria-label="Open video full screen" onClick={onOpen}><Maximize2 size={18}/></button>}
  {full&&Number.isFinite(duration)&&duration>0&&<input className="post-video-seek" aria-label="Seek video" type="range" min={0} max={duration} step="0.1" value={time} onChange={e=>{if(video.current)video.current.currentTime=Number(e.target.value)}}/>}
 </div>;
}
