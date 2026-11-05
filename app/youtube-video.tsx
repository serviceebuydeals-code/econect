import {useEffect,useRef,useState} from 'react';
import {Video as Youtube,Send} from 'lucide-react';
import {youtubeVideo} from '../shared/youtube';
import './youtube-video.css';
let apiPromise:Promise<any>|null=null;
function loadYouTube(){
 const w=window as any;if(w.YT?.Player)return Promise.resolve(w.YT);
 if(!apiPromise)apiPromise=new Promise((resolve,reject)=>{const previous=w.onYouTubeIframeAPIReady;w.onYouTubeIframeAPIReady=()=>{previous?.();resolve(w.YT)};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.onerror=()=>{apiPromise=null;script.remove();reject(Error('YouTube could not load.'))};document.head.appendChild(script)});
 return apiPromise;
}
export function YouTubeVideo({url,autoPlay=true}:{url:string,autoPlay?:boolean}){
 const asset=youtubeVideo(url),box=useRef<HTMLDivElement>(null),player=useRef<any>(null),visible=useRef(false),manual=useRef(false),automaticPause=useRef(false),ready=useRef(false),blocked=useRef(false),key=useRef(crypto.randomUUID());
 const [wanted,setWanted]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{
  const element=box.current;if(!element)return;
  const pause=()=>{if(ready.current&&[1,3].includes(player.current?.getPlayerState?.())){automaticPause.current=true;player.current.pauseVideo()}};
  const resume=()=>{if(autoPlay&&ready.current&&visible.current&&!manual.current&&!blocked.current&&document.visibilityState==='visible')player.current.playVideo()};
  const observer=new IntersectionObserver(entries=>{const e=entries[0],next=e.isIntersecting&&e.intersectionRatio>=.55;if(next&&!visible.current)blocked.current=false;visible.current=next;if(next){setWanted(true);resume()}else pause()},{threshold:[0,.55,1]});observer.observe(element);
  const onVisibility=()=>document.visibilityState==='visible'?resume():pause();
  const other=(event:Event)=>{if((event as CustomEvent).detail!==key.current){blocked.current=true;pause()}};
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('econect-video-playing',other);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('econect-video-playing',other)};
 },[url,autoPlay]);
 useEffect(()=>{
  if(!wanted||!asset||!box.current)return;let active=true;const host=document.createElement('div');box.current.appendChild(host);setError(false);
  loadYouTube().then(YT=>{if(!active)return;player.current=new YT.Player(host,{host:'https://www.youtube-nocookie.com',videoId:asset.id,playerVars:{playsinline:1,controls:1,rel:0,origin:location.origin},events:{
   onReady:()=>{if(!active)return;ready.current=true;player.current.mute();if(autoPlay&&visible.current&&!manual.current&&!blocked.current&&document.visibilityState==='visible')player.current.playVideo()},
   onStateChange:(event:any)=>{if(!active)return;if(event.data===1){manual.current=false;blocked.current=false;window.dispatchEvent(new CustomEvent('econect-video-playing',{detail:key.current}))}if(event.data===2){if(automaticPause.current)automaticPause.current=false;else if(visible.current&&document.visibilityState==='visible')manual.current=true}},
   onError:()=>{if(active)setError(true)}
  }})}).catch(()=>{if(active)setError(true)});
  return()=>{active=false;ready.current=false;player.current?.destroy();player.current=null;host.remove()};
 },[wanted,asset?.id,autoPlay]);
 if(!asset)return null;
 return <div className="youtube-video"><div className="youtube-player-host" ref={box}>{!wanted&&<img src={asset.poster} alt="YouTube video preview" loading="lazy"/>}</div>{error&&<p>This video cannot play here. Open it on YouTube below.</p>}<a href={asset.url} target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a></div>;
}
export function YouTubeComposer({initialCaption,onPost}:{initialCaption:string,onPost:(asset:NonNullable<ReturnType<typeof youtubeVideo>>,caption:string)=>Promise<void>}){
 const [link,setLink]=useState(''),[caption,setCaption]=useState(initialCaption),[busy,setBusy]=useState(false),[error,setError]=useState('');const asset=youtubeVideo(link);
 return <form className="youtube-composer" onSubmit={async e=>{e.preventDefault();if(!asset||busy)return;setBusy(true);setError('');try{await onPost(asset,caption)}catch(e:any){setError(e.message||'Unable to post this video.')}finally{setBusy(false)}}}><h2><Youtube size={25}/> Share a YouTube video</h2><label>YouTube link<input name="youtube" type="text" inputMode="url" autoFocus placeholder="Paste a YouTube video link" autoComplete="off" maxLength={2048} value={link} disabled={busy} onChange={e=>{setLink(e.target.value);setError('')}} required/></label>{link.trim()&&!asset&&<p role="alert">Enter a valid YouTube video, Shorts or youtu.be link.</p>}{asset&&<YouTubeVideo url={asset.url} autoPlay={false}/>}<label>Caption<textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={10000} rows={3} disabled={busy} placeholder="Say something about this video…"/></label><p className="muted">Each like or comment transfers 10 points from that member to you. Some YouTube videos cannot be played outside YouTube.</p>{error&&<p role="alert">{error}</p>}<button className="primary full" type="submit" disabled={!asset||busy}>{busy?'Posting…':'Post YouTube video'}<Send size={16}/></button></form>;
}
