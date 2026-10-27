import{getCoinPrice,coinAmount}from'./pricing';
import {env} from 'cloudflare:workers';
import {getUser} from './auth';
const uuid=()=>crypto.randomUUID();
const error=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const clean=(v:any,n=200)=>String(v??'').trim().slice(0,n);
const like=(v:string)=>'%'+v.replace(/[\\%_]/g,'\\$&')+'%';
export async function marketRoute(r:Request):Promise<Response>{try{
 const db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/market/'.length),auth=await getUser(r),uid=auth?.userId;
 const q=(s:string,...v:any[])=>db.prepare(s).bind(...v),one=(s:string,...v:any[])=>q(s,...v).first<any>(),all=async(s:string,...v:any[])=>(await q(s,...v).all()).results;
 const guard=async()=>{if(!uid)error('Please log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))error('Create your profile first.',403)};
 const productSQL='SELECT m.*,p.username,p.name seller_name,p.avatar,c.name category_name,s.name subcategory_name,COALESCE(sh.phone,\'\') shop_phone FROM market_products m JOIN profiles p ON p.id=m.seller JOIN market_categories c ON c.id=m.category LEFT JOIN market_categories s ON s.id=m.subcategory LEFT JOIN market_shops sh ON sh.seller=m.seller';
 if(r.method==='GET'){
  if(path==='categories')return Response.json(await all('SELECT * FROM market_categories ORDER BY admin_created DESC,name'));
  if(path==='products'){
   const term=clean(url.searchParams.get('q'),150),shop=clean(url.searchParams.get('shop')),folder=clean(url.searchParams.get('folder')),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
   const clauses=['m.active=1'],args:any[]=[];if(shop){clauses.push('p.username=? COLLATE NOCASE');args.push(shop)}if(folder){clauses.push('m.folder=?');args.push(folder)}
   if(term){clauses.push("(m.name LIKE ? ESCAPE '\\' OR m.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')");args.push(...Array(4).fill(like(term)))}
   const where=' WHERE '+clauses.join(' AND '),limit=shop||term?60:600,offset=shop||term?page*limit:0;
   const products=await all(productSQL+where+' ORDER BY m.created DESC,m.rowid DESC LIMIT ? OFFSET ?',...args,limit,offset);
   const count=await one('SELECT count(*) total FROM market_products m JOIN profiles p ON p.id=m.seller JOIN market_categories c ON c.id=m.category LEFT JOIN market_categories s ON s.id=m.subcategory'+where,...args);
   const owner=shop?await one('SELECT p.id,p.username,p.name,p.surname,p.avatar,p.bio,COALESCE(s.phone,\'\') phone FROM profiles p LEFT JOIN market_shops s ON s.seller=p.id WHERE p.username=? COLLATE NOCASE',shop):null;
   return Response.json({products,total:count.total,hasMore:!!(shop||term)&&offset+products.length<count.total,owner,folders:owner?await all("SELECT f.*,(SELECT images FROM market_products WHERE folder=f.id AND active=1 ORDER BY created DESC,rowid DESC LIMIT 1) images FROM market_folders f WHERE seller=? ORDER BY created DESC",owner.id):[]});
  }
  if(path==='product'){const p=await one(productSQL+' WHERE m.id=? AND m.active=1',url.searchParams.get('id'));if(!p)error('Product unavailable.',404);return Response.json(p)}
  if(path==='search'){
   await guard();const term=clean(url.searchParams.get('q'),150);if(!term)return Response.json({members:[],posts:[]});const t=like(term.replace(/^@/,''));
   return Response.json({members:await all("SELECT id,username,name,surname,avatar,country,city FROM profiles WHERE name LIKE ? ESCAPE '\\' OR surname LIKE ? ESCAPE '\\' OR (name||' '||surname) LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' ORDER BY created DESC LIMIT 60",t,t,t,t),posts:await all("SELECT p.*,u.name,u.surname,u.username,u.avatar,(SELECT count(*) FROM likes WHERE post=p.id) likes,(SELECT count(*) FROM comments WHERE post=p.id) comments FROM posts p JOIN profiles u ON u.id=p.user WHERE p.body LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' ORDER BY p.created DESC LIMIT 100",like(term),t,t)});
  }
  if(path==='feed'){const page=Math.max(0,Math.min(19,Number(url.searchParams.get('page'))||0));return Response.json(await all('SELECT p.*,u.name,u.surname,u.username,u.avatar,(SELECT count(*) FROM likes WHERE post=p.id) likes,(SELECT count(*) FROM comments WHERE post=p.id) comments FROM posts p JOIN profiles u ON u.id=p.user ORDER BY p.created DESC,p.rowid DESC LIMIT 20 OFFSET ?',page*20))}
  if(path==='preferences'){await guard();return Response.json(await one('SELECT personalized FROM market_preferences WHERE user=?',uid)||{personalized:null})}
  if(path==='requests'){await guard();return Response.json(await all('SELECT r.*,m.name product_name,m.images,p.username,p.name,p.avatar FROM market_requests r JOIN market_products m ON m.id=r.product JOIN profiles p ON p.id=CASE WHEN r.seller=? THEN r.buyer ELSE r.seller END WHERE r.seller=? OR r.buyer=? ORDER BY r.created DESC LIMIT 200',uid,uid,uid))}
  if(path==='promotions'){await guard();return Response.json(await all('SELECT * FROM market_promotions WHERE seller=? ORDER BY created DESC LIMIT 100',uid))}
  if(path==='admin'){await guard();if(!auth?.isAdmin)error('Admin only.',403);return Response.json(await all("SELECT a.*,p.username FROM market_promotions a JOIN profiles p ON p.id=a.seller WHERE a.source='bank' ORDER BY a.created DESC LIMIT 200"))}
  error('Not found',404);
 }
 if(r.method!=='POST')error('Method not allowed',405);await guard();if(r.headers.get('origin')&&r.headers.get('origin')!==url.origin)error('Invalid origin',403);const b:any=await r.json();
 if(path==='product'){
  const name=clean(b.name,180),description=clean(b.description,10000),location=clean(b.location,180),price=Number(b.price),images=b.images;
  if(!name||!description||!location||!Number.isFinite(price)||price<=0||price>1e12)error('Complete all product details with a valid price.');
  if(!Array.isArray(images)||!images.length||images.length>10||images.some((v:any)=>typeof v!=='string'||!v.startsWith('/api/media?key=public')))error('Upload 1–10 product photos.');
  const productId=clean(b.id,80)||uuid();if(await one('SELECT id FROM market_products WHERE id=? AND seller=?',productId,uid))return Response.json({id:productId});
  let category=clean(b.category),subcategory=clean(b.subcategory)||null;
  if(!category){const text=(name+' '+description).toLowerCase();category=/phone|laptop|computer|electronic|solar|camera|charger/.test(text)?'electronics':/dress|shirt|shoe|fashion|bag/.test(text)?'fashion':/chair|table|sofa|furniture|bed|curtain|light|kitchen/.test(text)?'home':/car|vehicle|motorcycle/.test(text)?'vehicles':/land|house|apartment|property/.test(text)?'property':/beauty|cream|hair|skin/.test(text)?'beauty':/food|rice|grocery/.test(text)?'food':/service|repair|cleaning/.test(text)?'services':'other';}
  if(!await one('SELECT id FROM market_categories WHERE id=? AND parent IS NULL',category))error('Choose a main category.');
  const statements:any[]=[];if(subcategory&&!await one('SELECT id FROM market_categories WHERE id=? AND parent=?',subcategory,category))error('Choose a subcategory of this main category.');
  if(!subcategory){const nameSub=clean(b.subcategoryName,80)||name.split(/\s+/).slice(0,2).join(' ');const existing=await one('SELECT id FROM market_categories WHERE parent=? AND name=? COLLATE NOCASE',category,nameSub);subcategory=existing?.id||uuid();if(!existing)statements.push(q('INSERT INTO market_categories(id,name,parent) VALUES(?,?,?)',subcategory,nameSub,category));}
  statements.push(q('INSERT INTO market_products(id,seller,name,price,location,description,images,category,subcategory) VALUES(?,?,?,?,?,?,?,?,?)',productId,uid,name,price,location,description,JSON.stringify(images),category,subcategory));await db.batch(statements);return Response.json({id:productId});
 }
 if(path==='buy'){
  const p=await one('SELECT * FROM market_products WHERE id=? AND active=1',b.product);if(!p||p.seller===uid)error('Choose another member’s product.');
  const snapshot=JSON.stringify({id:p.id,name:p.name,price:p.price,location:p.location,image:JSON.parse(p.images||'[]')[0]||''}),conversation=uuid();
  const conversationQuery="SELECT id FROM conversations WHERE ((starter=? AND recipient=?) OR (starter=? AND recipient=?)) AND status IN('active','inquiry') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,created DESC LIMIT 1";
  await db.batch([
   q('INSERT OR IGNORE INTO market_requests(id,product,buyer,seller) VALUES(?,?,?,?)',uuid(),p.id,uid,p.seller),
   q("INSERT INTO conversations(id,starter,recipient,status) SELECT ?,?,?,'inquiry' WHERE NOT EXISTS(SELECT 1 FROM conversations WHERE ((starter=? AND recipient=?) OR (starter=? AND recipient=?)) AND status IN('active','inquiry'))",conversation,uid,p.seller,uid,p.seller,p.seller,uid),
   q("INSERT OR IGNORE INTO messages(id,conversation,sender,kind,body) SELECT 'product-'||r.id||'-'||c.id,c.id,?,'product',? FROM market_requests r JOIN conversations c ON c.id=("+conversationQuery+") WHERE r.product=? AND r.buyer=?",uid,snapshot,uid,p.seller,p.seller,uid,p.id,uid)
  ]);
  const c=await one(conversationQuery,uid,p.seller,p.seller,uid);return Response.json({seller:p.seller,conversation:c.id,ok:true});
 }
 if(path==='shop-phone'){const phone=String(b.phone||'').trim();if(phone&&(!/^[+0-9 ()-]{5,30}$/.test(phone)||phone.replace(/[^0-9]/g,'').length<5))error('Enter a valid shop phone number.');await q("INSERT INTO market_shops(seller,phone) VALUES(?,?) ON CONFLICT(seller) DO UPDATE SET phone=excluded.phone,updated=CURRENT_TIMESTAMP",uid,phone).run();return Response.json({ok:true})}
 if(path==='folder'){const name=clean(b.name,80);if(!name)error('Enter a folder name.');await q('INSERT INTO market_folders(id,seller,name) VALUES(?,?,?)',uuid(),uid,name).run();return Response.json({ok:true})}
 if(path==='move'){if(b.folder&&!await one('SELECT id FROM market_folders WHERE id=? AND seller=?',b.folder,uid))error('Folder unavailable.');await q('UPDATE market_products SET folder=? WHERE id=? AND seller=?',b.folder||null,b.product,uid).run();return Response.json({ok:true})}
 if(path==='remove'){await q('UPDATE market_products SET active=0 WHERE id=? AND seller=?',b.product,uid).run();return Response.json({ok:true})}
 if(path==='preferences'){if(typeof b.personalized!=='boolean')error('Choose a preference.');await db.batch([q('INSERT INTO market_preferences(user,personalized) VALUES(?,?) ON CONFLICT(user) DO UPDATE SET personalized=excluded.personalized,updated=CURRENT_TIMESTAMP',uid,b.personalized?1:0),...(!b.personalized?[q('DELETE FROM market_interests WHERE user=?',uid)]:[])]);return Response.json({ok:true})}
 if(path==='interest'){if(!(await one('SELECT personalized FROM market_preferences WHERE user=?',uid))?.personalized)return Response.json({ok:true});const p=await one('SELECT category FROM market_products WHERE id=? AND active=1',b.product);if(p)await q('INSERT INTO market_interests(user,category) VALUES(?,?) ON CONFLICT(user,category) DO UPDATE SET score=min(100,score+1),updated=CURRENT_TIMESTAMP',uid,p.category).run();return Response.json({ok:true})}
 if(path==='promote'){
  const product=clean(b.product)||null,days=Number(b.days),source=b.source;if(![3,7,30].includes(days)||!['wallet','bank'].includes(source))error('Choose a promotion package.');if(product&&!await one('SELECT id FROM market_products WHERE id=? AND seller=? AND active=1',product,uid))error('Product unavailable.');if(!product&&!await one('SELECT id FROM market_products WHERE seller=? AND active=1',uid))error('Upload a product before promoting your shop.');
  const coins=(product?{3:2,7:4,30:8}:{3:8,7:15,30:30})[days as 3|7|30],key=clean(b.id,80)||uuid();const existing=await one('SELECT id,coins,status,amount_ngn FROM market_promotions WHERE id=? AND seller=?',key,uid);if(existing)return Response.json({...existing,amount:existing.amount_ngn});
  if(source==='bank'&&!await one("SELECT value FROM settings WHERE key='bank'"))error('Payments open when the administrator adds bank details.');
  const price=await getCoinPrice(db);if(b.coinPrice!==undefined&&Number(b.coinPrice)!==price)error('The eCoin price changed. Refresh before continuing.',409);const amount=coinAmount(coins,price);
  await q("INSERT INTO market_promotions(id,seller,product,days,coins,source,status,amount_ngn,starts,ends) VALUES(?,?,?,?,?,?,?,?,CASE WHEN ?='wallet' THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ?='wallet' THEN datetime('now',?) ELSE NULL END)",key,uid,product,days,coins,source,source==='wallet'?'confirmed':'pending',amount,source,source,'+'+days+' days').run();return Response.json({id:key,coins,amount,status:source==='wallet'?'confirmed':'pending'});
 }
 if(path==='payment-sent'){if(!clean(b.reference,150))error('Enter the bank transfer reference.');await q("UPDATE market_promotions SET reference=? WHERE id=? AND seller=? AND status='pending'",clean(b.reference,150),b.id,uid).run();return Response.json({ok:true})}
 if(path==='admin-category'){if(!auth?.isAdmin)error('Admin only.',403);const name=clean(b.name,80);if(!name)error('Enter a category name.');if(b.parent&&!await one('SELECT id FROM market_categories WHERE id=? AND parent IS NULL',b.parent))error('Main category unavailable.');await q('INSERT INTO market_categories(id,name,parent,admin_created) VALUES(?,?,?,1)',uuid(),name,b.parent||null).run();return Response.json({ok:true})}
 if(path==='admin-payment'){if(!auth?.isAdmin)error('Admin only.',403);await q("UPDATE market_promotions SET status=?,starts=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE NULL END,ends=CASE WHEN ?=0 THEN datetime('now','+'||days||' days') ELSE NULL END WHERE id=? AND status='pending' AND source='bank'",b.reject?'rejected':'confirmed',b.reject?1:0,b.reject?1:0,b.id).run();return Response.json({ok:true})}
 if(path==='ad'){
  const page=Number(b.page),slot=clean(b.slot,100);if(!Number.isInteger(page)||page<0||page>=20||!slot)error('Invalid feed placement.');
  const day=new Date(Date.now()+3600000).toISOString().slice(0,10);if((await one('SELECT count(*) n FROM market_ad_views WHERE user=? AND day=?',uid,day)).n>=3)return Response.json(null);
  if(await one('SELECT id FROM market_ad_views WHERE user=? AND day=? AND slot=?',uid,day,slot))return Response.json(null);
  const personalized=!!(await one('SELECT personalized FROM market_preferences WHERE user=?',uid))?.personalized;
  const ad=await one("SELECT a.id promotion,m.*,p.username,p.name seller_name,p.avatar,c.name category_name FROM market_promotions a JOIN market_products m ON m.seller=a.seller AND (a.product IS NULL OR m.id=a.product) JOIN profiles p ON p.id=m.seller JOIN market_categories c ON c.id=m.category WHERE a.status='confirmed' AND a.ends>CURRENT_TIMESTAMP AND m.active=1 AND a.seller!=? ORDER BY "+(personalized?"COALESCE((SELECT score FROM market_interests i WHERE i.user=? AND i.category=m.category AND i.updated>datetime('now','-90 days')),0) DESC, ":'')+"(SELECT count(*) FROM market_ad_views v WHERE v.user=? AND v.promotion=a.id AND v.day=?) ASC,random() LIMIT 1",uid,...(personalized?[uid]:[]),uid,day);
  if(!ad)return Response.json(null);
  // The conditional INSERT enforces the cap even when concurrent tabs request an ad.
  const saved=await q('INSERT OR IGNORE INTO market_ad_views(id,user,promotion,day,slot) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM market_ad_views WHERE user=? AND day=?)<3',uuid(),uid,ad.promotion,day,slot,uid,day).run();return Response.json(saved.meta.changes?{...ad,personalized}:null);
 }
 return error('Not found',404);
}catch(e:any){return Response.json({error:e.message?.includes('no such table')?'Marketplace setup is pending. Apply database migration 0004_marketplace.sql.':e.message?.includes('UNIQUE')?'Already saved. Choose another name if needed.':e.message||'Please try again.'},{status:e.status||400})}}
