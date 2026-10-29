import {useEffect,useRef} from 'react';
// Resolve layout shifts once on entry, then leave navigation under the reader's control.
export function useSharedPost(ready:boolean){
 const opened=useRef(false);
 useEffect(()=>{
  if(!ready||opened.current)return;
  const id=new URLSearchParams(location.search).get('post');if(!id)return;
  const target=document.getElementById('post-'+id);if(!target)return;
  opened.current=true;
  let frame=0,stopped=false;
  const scroll=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!stopped)target.scrollIntoView({block:'start',behavior:'instant'})})};
  const events=['wheel','touchstart','pointerdown','keydown'];
  const stop=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('load',scroll,true);events.forEach(type=>window.removeEventListener(type,stop,true));clearTimeout(timer)};
  const observer=new ResizeObserver(scroll);observer.observe(document.body);
  const timer=setTimeout(stop,6000);
  events.forEach(type=>window.addEventListener(type,stop,{capture:true,passive:true}));document.addEventListener('load',scroll,true);
  target.setAttribute('tabindex','-1');target.focus({preventScroll:true});scroll();
  return stop;
 },[ready]);
}
