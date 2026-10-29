const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Only public eConect uploads may appear in unauthenticated link previews.
function publicMedia(value:unknown,origin:string){if(typeof value!=='string')return '';try{const url=new URL(value,origin);return url.origin===origin&&url.pathname==='/api/media'&&url.searchParams.get('key')?.startsWith('public/')?url.href:''}catch{return ''}}
export async function postPreview(request:Request,env:Cloudflare.Env):Promise<Response>{
 const url=new URL(request.url),id=url.searchParams.get('post')||'';
 const post=await env.DB.prepare('SELECT p.body,p.media,u.name,u.surname,u.username,u.avatar FROM posts p JOIN profiles u ON u.id=p.user WHERE p.id=?').bind(id).first<any>();
 const base=await env.ASSETS.fetch(new Request(url.origin+'/',request));
 const canonical=new URL('/',url.origin);canonical.searchParams.set('post',id);
 let media:any[]=[];try{const parsed=JSON.parse(post?.media||'[]');if(Array.isArray(parsed))media=parsed}catch{}
 const first=media.find(m=>m&&['image','video'].includes(m.type)&&publicMedia(m.url,url.origin));
 const video=first?.type==='video'?publicMedia(first.url,url.origin):'';
 const image=(first?.type==='image'?publicMedia(first.url,url.origin):publicMedia(first?.poster,url.origin))||media.filter(m=>m?.type==='image').map(m=>publicMedia(m.url,url.origin)).find(Boolean)||publicMedia(post?.avatar,url.origin)||'';
 const author=post?([post.name,post.surname].filter(Boolean).join(' ')||'@'+post.username):'';
 const title=post?author+' on eConect':'Post unavailable · eConect';
 const description=post?(String(post.body||'').replace(/\s+/g,' ').trim().slice(0,240)||(video?'Watch this video on eConect.':image?'See this photo on eConect.':'View this post on eConect.')):'This post is no longer available.';
 const meta=(property:string,content:string)=>`<meta property="${property}" content="${escape(content)}"/>`;
 let tags=meta('og:title',title)+meta('og:description',description)+meta('og:url',canonical.href)+meta('og:type',video?'video.other':'article')+meta('og:site_name','eConect');
 if(image)tags+=meta('og:image',image)+meta('og:image:secure_url',image)+meta('og:image:alt',description);
 if(video){tags+=meta('og:video',video)+meta('og:video:secure_url',video);const key=new URL(video).searchParams.get('key')!;const object=await env.BUCKET?.head(key);const type=object?.httpMetadata?.contentType;if(type?.startsWith('video/'))tags+=meta('og:video:type',type)}
 tags+=`<meta name="twitter:card" content="${image?'summary_large_image':'summary'}"/><meta name="twitter:title" content="${escape(title)}"/><meta name="twitter:description" content="${escape(description)}"/>`+(image?`<meta name="twitter:image" content="${escape(image)}"/>`:'')+`<link rel="canonical" href="${escape(canonical.href)}"/>`;
 const html=(await base.text()).replace(/<title>[^<]*<\/title>/i,`<title>${escape(title)}</title>`).replace(/<meta\s+name="description"[^>]*>/i,`<meta name="description" content="${escape(description)}"/>`).replace('</head>',tags+'</head>');
 const headers=new Headers(base.headers);for(const name of ['Content-Length','ETag','Last-Modified','Content-Encoding'])headers.delete(name);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','no-store');
 return new Response(request.method==='HEAD'?null:html,{status:post?200:404,headers});
}

export async function sharedPost(request:Request,env:Cloudflare.Env){const id=new URL(request.url).searchParams.get('id')||'';const post=await env.DB.prepare('SELECT p.id,p.user,p.body,p.media,p.created,u.name,u.surname,u.username,u.avatar,(SELECT count(*) FROM likes WHERE post=p.id) likes,(SELECT count(*) FROM comments WHERE post=p.id) comments FROM posts p JOIN profiles u ON u.id=p.user WHERE p.id=?').bind(id).first();return Response.json(post||{error:'This post is no longer available.'},{status:post?200:404,headers:{'Cache-Control':'no-store'}})}
