import {prepareProfilePhoto} from './profile-photo';
import {useEffect,useRef,useState} from 'react';
export function ProfilePhotoUpload({avatar,name,save,onSaved,onBusy}:{avatar?:string,name?:string,save:(file:File)=>Promise<string>,onSaved:(url:string)=>void,onBusy:(busy:boolean)=>void}){
 const [preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const active=useRef(true),locked=useRef(false),local=useRef('');
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(locked.current)onBusy(false);if(local.current)URL.revokeObjectURL(local.current)}},[]);
 async function choose(input:HTMLInputElement){
  const original=input.files?.[0];input.value='';if(!original||locked.current)return;
  setError('');setSaved(false);
  if(local.current)URL.revokeObjectURL(local.current);
  local.current=URL.createObjectURL(original);setPreview(local.current);
  locked.current=true;setBusy(true);onBusy(true);
  try{const file=await prepareProfilePhoto(original);if(!active.current)return;if(local.current)URL.revokeObjectURL(local.current);local.current=URL.createObjectURL(file);setPreview(local.current);const url=await save(file);if(active.current){onSaved(url);setSaved(true)}}
  catch(e:any){if(active.current)setError(e.name==='TimeoutError'||e.name==='AbortError'?'Photo upload timed out. Check your connection and select the picture again.':e.message||'The photo could not be saved. Select it again to retry.')}
  finally{locked.current=false;if(active.current){setBusy(false);onBusy(false)}}
 }
 return <div className="profile-photo-upload"><label>Profile photo<input type="file" accept="image/*,.heic,.heif,.avif" disabled={busy} onChange={e=>void choose(e.currentTarget)}/></label><span className="avatar" style={{width:76,height:76,minWidth:76}}>{preview||avatar?<img src={preview||avatar} alt="Selected profile photo"/>:<span>{name?.[0]||'e'}</span>}</span><p role="status" aria-live="polite">{busy?'Preparing and saving your photo…':saved?'Profile photo saved.':'Choose a photo. Phone formats and large pictures are converted automatically.'}</p>{error&&<p role="alert" style={{color:'#b42318'}}>Photo not saved: {error}</p>}</div>;
}
