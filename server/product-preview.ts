import {productIdFromLocation,productHref} from '../shared/product-link';
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function productPreview(request:Request,env:Cloudflare.Env):Promise<Response>{
 const url=new URL(request.url),id=productIdFromLocation(url);
 const product=await env.DB.prepare('SELECT name,description,images FROM market_products WHERE id=? AND active=1').bind(id).first<any>();
 const base=await env.ASSETS.fetch(new Request(url.origin+'/',request));
 const canonical=new URL(productHref(id),url.origin);
 let image='';try{const images=JSON.parse(product?.images||'[]');if(Array.isArray(images)&&typeof images[0]==='string'){const first=new URL(images[0],url.origin);if(first.origin===url.origin&&first.pathname==='/api/media'&&first.searchParams.get('key')?.startsWith('public/'))image=first.href}}catch{}
 const title=product?String(product.name)+' · eConect':'Product unavailable · eConect',description=product?(String(product.description||'').replace(/\s+/g,' ').trim().slice(0,240)||'View this product on eConect.'):'This product is no longer available.';
 const meta=(property:string,value:string)=>'<meta property="'+property+'" content="'+escape(value)+'"/>';
 let tags=meta('og:title',title)+meta('og:description',description)+meta('og:url',canonical.href)+meta('og:type','product')+meta('og:site_name','eConect');
 if(image)tags+=meta('og:image',image)+meta('og:image:secure_url',image)+meta('og:image:alt',String(product.name));
 tags+='<meta name="twitter:card" content="'+(image?'summary_large_image':'summary')+'"/><meta name="twitter:title" content="'+escape(title)+'"/><meta name="twitter:description" content="'+escape(description)+'"/>'+(image?'<meta name="twitter:image" content="'+escape(image)+'"/>':'')+'<link rel="canonical" href="'+escape(canonical.href)+'"/>';
 const html=(await base.text()).replace(/<title>[^<]*<\/title>/i,'<title>'+escape(title)+'</title>').replace(/<meta\s+name="description"[^>]*>/i,'<meta name="description" content="'+escape(description)+'"/>').replace('</head>',tags+'</head>');
 const headers=new Headers(base.headers);for(const name of ['Content-Length','ETag','Last-Modified','Content-Encoding'])headers.delete(name);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','no-store');
 return new Response(request.method==='HEAD'?null:html,{status:product?200:404,headers});
}
