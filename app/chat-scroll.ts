import {useLayoutEffect,useRef} from 'react';
// Follow new messages only while already at the bottom, or after sending.
export function useChatScroll(conversation:string|undefined,messages:any[]|undefined,user:string|undefined){
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),following=useRef(true),opened=useRef(''),last=useRef('');
 useLayoutEffect(()=>{const box=viewport.current;if(!conversation||!box)return;following.current=true;opened.current='';last.current='';const onScroll=()=>{following.current=box.scrollHeight-box.clientHeight-box.scrollTop<80};box.addEventListener('scroll',onScroll,{passive:true});const resize=()=>{if(following.current)box.scrollTop=box.scrollHeight};const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);if(content.current)observer?.observe(content.current);observer?.observe(box);return()=>{box.removeEventListener('scroll',onScroll);observer?.disconnect()}},[conversation]);
 useLayoutEffect(()=>{const box=viewport.current;if(!conversation||!box||!messages)return;const newest=messages.at(-1),fresh=last.current!==newest?.id;if(opened.current!==conversation||following.current||(fresh&&newest?.sender===user)){box.scrollTop=box.scrollHeight;following.current=true}opened.current=conversation;last.current=newest?.id||''},[conversation,messages,user]);
 return {viewport,content};
}

export function useChatViewport(active:boolean){
 const frame=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const element=frame.current;if(!active||!element)return;const viewport=window.visualViewport;
 const fit=()=>{if(!window.matchMedia('(max-width:760px)').matches){element.style.removeProperty('--chat-top');element.style.removeProperty('--chat-height');return}const top=Math.max(0,document.querySelector('header.topbar')?.getBoundingClientRect().bottom||0),bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;element.style.setProperty('--chat-top',top+'px');element.style.setProperty('--chat-height',Math.max(120,bottom-top)+'px')};
 fit();window.addEventListener('resize',fit);viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);return()=>{window.removeEventListener('resize',fit);viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit)};
 },[active]);return frame;
}
