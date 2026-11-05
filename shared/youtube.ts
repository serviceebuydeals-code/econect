// Accept only individual videos on YouTube's own domains; never embed supplied HTML.
export function youtubeVideo(value:unknown){
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  const input=value.trim(),url=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase();let id='';
  if(host==='youtu.be')id=url.pathname.split('/')[1]||'';
  else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
   if(url.pathname==='/watch')id=url.searchParams.get('v')||'';
   else if(/^\/(shorts|embed|live)\//.test(url.pathname))id=url.pathname.split('/')[2]||'';
  }
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id))return null;
  return {type:'video' as const,provider:'youtube' as const,id,url:'https://www.youtube.com/watch?v='+id,poster:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',embed:'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0'};
 }catch{return null}
}
