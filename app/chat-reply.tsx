import {useEffect,useRef,type ReactNode} from 'react';
import {CornerUpLeft,Image,Video,Mic,ShoppingBag,X} from 'lucide-react';
import {createReplyGesture} from './chat-reply-gesture';
export type ReplyMessage={id:string;sender:string;kind:string;body:string;username?:string;name?:string};
function ReplyContent({message,author}:{message:ReplyMessage;author:string}){
 let product:any=null;if(message.kind==='product')try{product=JSON.parse(message.body)}catch{}
 const label=message.kind==='text'?message.body:message.kind==='image'?'Photo':message.kind==='video'?'Video':message.kind==='voice'?'Voice note':product?.name||'Product';
 const thumbnail=message.kind==='image'?message.body:message.kind==='product'&&typeof product?.image==='string'?product.image:'';
 const Icon=message.kind==='image'?Image:message.kind==='video'?Video:message.kind==='voice'?Mic:message.kind==='product'?ShoppingBag:CornerUpLeft;
 return <><span className="reply-thumb">{thumbnail?<img src={thumbnail} alt="" loading="lazy"/>:message.kind==='video'?<video src={message.body} muted playsInline preload="metadata" aria-hidden="true"/>:<Icon size={21}/>}</span><span className="reply-copy"><strong>{author}</strong><span>{label}</span></span></>;
}
export function ChatReplyPreview({message,author,cancel,jump}:{message:ReplyMessage;author:string;cancel?:()=>void;jump?:()=>void}){
 return cancel?<div className="chat-reply-draft"><ReplyContent message={message} author={'Replying to '+author}/><button type="button" className="icon-button" aria-label="Cancel reply" onClick={cancel}><X size={17}/></button></div>:<button type="button" className="chat-reply-quote" aria-label={'View message from '+author} onClick={jump}><ReplyContent message={message} author={author}/></button>;
}
export function ReplyableMessage({id,own,onReply,children}:{id:string;own:boolean;onReply:()=>void;children:ReactNode}){
 const callback=useRef(onReply);callback.current=onReply;const gesture=useRef<ReturnType<typeof createReplyGesture>|null>(null);if(!gesture.current)gesture.current=createReplyGesture(()=>callback.current());useEffect(()=>()=>gesture.current?.cancel(),[]);
 return <div id={'chat-message-'+id} className={'message-bubble '+(own?'own':'')} onPointerDown={e=>{if(e.isPrimary&&e.button===0)gesture.current!.start(e.clientX,e.clientY)}} onPointerMove={e=>gesture.current!.move(e.clientX,e.clientY)} onPointerUp={e=>gesture.current!.end(e.clientX,e.clientY)} onPointerCancel={()=>gesture.current!.cancel()} onContextMenu={e=>{e.preventDefault();gesture.current!.context()}} onClickCapture={e=>{if(gesture.current!.consumeClick()){e.preventDefault();e.stopPropagation()}}}>
 {children}
 </div>;
}
