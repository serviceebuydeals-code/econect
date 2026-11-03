import {getUser} from './auth';
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
export const isStreamKey=(key:string)=>/^public\/stream\/[a-f0-9-]{36}$/.test(key)||/^private\/messages\/[^/]+\/stream\/[a-f0-9-]{36}$/.test(key);
async function provider(env:Cloudflare.Env,path:string,method='GET',body?:unknown){
 if(!env.STREAM_ACCOUNT_ID||!env.STREAM_API_TOKEN)fail('Video uploads are not available yet. Please try again later.',503);
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(env.STREAM_ACCOUNT_ID!)+'/stream'+path,{method,headers:{Authorization:'Bearer '+env.STREAM_API_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data:any=await response.json().catch(()=>null);
 if(!response.ok||!data?.success)fail('Cloudflare could not process this video. Please try again.',503);
 return data.result;
}
function mediaUrl(row:any){return '/api/media?key='+encodeURIComponent(row.media_key)+(row.conversation?'&conversation='+encodeURIComponent(row.conversation):'')}
export async function streamMedia(r:Request,env:Cloudflare.Env):Promise<Response>{try{
 const url=new URL(r.url),action=url.pathname==='/api/media'?'play':url.pathname.slice('/api/stream/'.length),db=env.DB;
 const auth=await getUser(r),uid=auth?.userId;
 const q=(sql:string,...values:any[])=>db.prepare(sql).bind(...values),one=(sql:string,...values:any[])=>q(sql,...values).first<any>();
 const guard=async()=>{if(!uid)fail('Log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403)};
 if(action==='play'&&['GET','HEAD'].includes(r.method)){
  const key=url.searchParams.get('key')||'';if(!isStreamKey(key))fail('Video unavailable.',404);
  const row=await one('SELECT * FROM stream_uploads WHERE media_key=? AND ready=1',key);if(!row)fail('Video unavailable.',404);
  let token=row.stream_uid;
  if(row.conversation){
   await guard();
   if(url.searchParams.get('conversation')!==row.conversation||!await one('SELECT id FROM conversations WHERE id=? AND (starter=? OR recipient=?)',row.conversation,uid,uid)||!await one("SELECT id FROM messages WHERE conversation=? AND kind='video' AND body=?",row.conversation,mediaUrl(row)))fail('Private media.',403);
   const result=await provider(env,'/'+encodeURIComponent(row.stream_uid)+'/token','POST',{exp:Math.floor(Date.now()/1000)+3600});token=result.token;
   if(typeof token!=='string'||!/^[a-zA-Z0-9._-]+$/.test(token))fail('Video playback unavailable.',503);
  }
  const base='https://videodelivery.net/'+token;
  const playback=base+'/manifest/video.m3u8';
  if(url.pathname==='/api/media')return Response.redirect(url.searchParams.get('thumbnail')==='1'?base+'/thumbnails/thumbnail.jpg?time=1s&height=640':playback,302);
  return Response.json({url:playback},{headers:{'Cache-Control':'no-store'}});
 }
 if(r.method!=='POST')fail('Not found.',404);
 if(r.headers.get('origin')!==url.origin)fail('Invalid origin.',403);
 await guard();const body:any=await r.json();
 if(action==='create'){
  const conversation=String(body.conversation||'');if(body.kind!=='post'&&body.kind!=='chat')fail('Invalid upload.');
  if(body.kind==='chat'&&!conversation)fail('Choose a conversation.');
  if(conversation&&(body.kind!=='chat'||!await one("SELECT id FROM conversations WHERE id=? AND status='active' AND (starter=? OR recipient=?)",conversation,uid,uid)))fail('Start a conversation first.',403);
  const id=crypto.randomUUID(),key=(conversation?'private/messages/'+uid+'/':'public/')+'stream/'+id,now=Date.now();
  const reserved=await q('INSERT INTO stream_uploads(id,owner,conversation,media_key,created) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM stream_uploads WHERE owner=? AND created>?)<20',id,uid,conversation||null,key,now,uid,now-3600000).run();
  if(!reserved.meta.changes)fail('Please wait before uploading more videos.',429);
  try{
   const result=await provider(env,'/direct_upload','POST',{maxDurationSeconds:conversation?60:180,expiry:new Date(now+600000).toISOString(),requireSignedURLs:!!conversation,meta:{name:'eConect '+id},creator:uid});
   if(!/^[a-f0-9]{32}$/.test(result?.uid||'')||!/^https:\/\/upload\.videodelivery\.net\//.test(result?.uploadURL||''))fail('Video upload unavailable.',503);
   await q('UPDATE stream_uploads SET stream_uid=? WHERE id=?',result.uid,id).run();
   return Response.json({id,uploadURL:result.uploadURL});
  }catch(error){await q('DELETE FROM stream_uploads WHERE id=?',id).run();throw error}
 }
 const row=await one('SELECT * FROM stream_uploads WHERE id=? AND owner=?',String(body.id||''),uid);if(!row)fail('Upload not found.',404);
 if(action==='status'){
  if(!row.ready){
   const result=await provider(env,'/'+encodeURIComponent(row.stream_uid));
   if(result.status?.state==='error')fail('This video could not be processed. Try another file.');
   if(!result.readyToStream)return Response.json({ready:false});
   if(!Number.isFinite(result.duration)||result.duration<=0||result.duration>(row.conversation?60:180)+.1||Number(result.size)>=30000000)fail('Choose a video within the upload size and duration limits.');
   // Private uploads must remain protected at the provider as well as in eConect.
   if(row.conversation&&!result.requireSignedURLs)fail('Video privacy protection is unavailable.',503);
   await db.batch([q('UPDATE stream_uploads SET ready=1,duration=? WHERE id=?',result.duration,row.id),...(row.conversation?[q("INSERT OR IGNORE INTO chat_media_uploads(key,owner,conversation,media_type,url) VALUES(?,?,?,'video',?)",row.media_key,uid,row.conversation,mediaUrl(row))]:[])]);
   row.duration=result.duration;
  }
  return Response.json({ready:true,url:mediaUrl(row),type:'video',duration:row.duration,...(!row.conversation?{poster:mediaUrl(row)+'&thumbnail=1'}:{})});
 }
 if(action==='cancel'){
  if(row.ready)fail('The upload has already completed.',409);
  await provider(env,'/'+encodeURIComponent(row.stream_uid),'DELETE');await q('DELETE FROM stream_uploads WHERE id=?',row.id).run();return Response.json({ok:true});
 }
 return fail('Not found.',404);
}catch(error:any){return Response.json({error:error.message||'Video service unavailable.'},{status:error.status||503,headers:{'Cache-Control':'no-store'}})}}
