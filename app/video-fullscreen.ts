// Expand the existing player. Moving playback to a second <video> loses its buffer.
export function expandVideo(container:HTMLElement,video:HTMLVideoElement,onClose:()=>void){
 const layer=crypto.randomUUID(),overflow=document.body.style.overflow;let finished=false;
 history.pushState({...history.state,econectVideoLayer:layer},'');
 document.body.style.overflow='hidden';container.classList.add('expanded-video');
 try{if(container.showPopover){container.setAttribute('popover','manual');container.showPopover()}}catch{container.removeAttribute('popover')}
 function finish(){
  if(finished)return;finished=true;
  window.removeEventListener('popstate',back);window.removeEventListener('keydown',escape);
  try{container.hidePopover?.()}catch{}
  container.removeAttribute('popover');container.classList.remove('expanded-video');document.body.style.overflow=overflow;onClose();
 }
 function close(){if(finished)return;if(history.state?.econectVideoLayer===layer)history.back();else finish()}
 function back(){if(history.state?.econectVideoLayer!==layer)finish()}
 function escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();close()}}
 window.addEventListener('popstate',back);window.addEventListener('keydown',escape);
 // Keep the same src, currentTime, volume, HLS instance and buffered segments.
 void video.play().catch(()=>{});
 return {close,dispose:finish};
}
