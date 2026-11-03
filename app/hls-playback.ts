import Hls from 'hls.js/light';
export function attachHls(video:HTMLVideoElement,url:string,onError:()=>void){
 if(!Hls.isSupported()){onError();return()=>{}}
 const hls=new Hls({capLevelToPlayerSize:true,startLevel:0,maxBufferLength:12,maxMaxBufferLength:24,backBufferLength:5,maxBufferSize:12000000});
 hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)onError()});
 hls.loadSource(url);hls.attachMedia(video);
 return()=>hls.destroy();
}
