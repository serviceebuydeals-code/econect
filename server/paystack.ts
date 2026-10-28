import {env} from 'cloudflare:workers';
import {getUser} from './auth';
import {getCoinPrice,coinAmount} from './pricing';
const normalPacks=[1,2,4,8,15,30,50,100],investmentPacks=[...normalPacks,200,400,800,1500,3000,5000,10000,20000];
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const validRef=(s:string)=>/^ec-[a-f0-9-]{36}$/i.test(s);
const validKey=(s:string|undefined)=>!!s&&/^sk_live_[a-zA-Z0-9]+$/.test(s);
const moneyKobo=(coins:number,price:number)=>Math.round(coinAmount(coins,price)*100);
async function paystackFetch(path:string,key:string,method='GET',body?:any){const r=await fetch('https://api.paystack.co'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let d:any;try{d=await r.json()}catch{fail('Paystack is temporarily unavailable. Please try again.',503)}if(!r.ok||!d?.status)fail('Paystack could not process this request. Please try again.',503);return d.data}
function checkoutUrl(raw:string){try{const u=new URL(raw);if(u.protocol!=='https:'||!(u.hostname==='paystack.com'||u.hostname.endsWith('.paystack.com')||u.hostname==='paystack.co'||u.hostname.endsWith('.paystack.co')))return '';return u.href}catch{return ''}}
async function verifiedWebhook(raw:string,signature:string,key:string){if(!/^[a-f0-9]{128}$/i.test(signature))return false;const bytes=new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16)));const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-512'},false,['verify']);return crypto.subtle.verify('HMAC',k,bytes,new TextEncoder().encode(raw))}
export async function paystackRoute(r:Request):Promise<Response>{try{
 const db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/paystack/'.length),key=env.PAYSTACK_SECRET_KEY;
 const q=(s:string,...v:any[])=>db.prepare(s).bind(...v),one=(s:string,...v:any[])=>q(s,...v).first<any>();
 if(!validKey(key))fail('Paystack live payments are not configured yet.',503);
 const secret=key!;
 async function verify(ref:string,owner?:string){
  if(!validRef(ref))fail('Invalid payment reference.');const tx=await one('SELECT * FROM paystack_transactions WHERE reference=?',ref);if(!tx||(owner&&tx.buyer!==owner))fail('Payment not found.',404);if(tx.status==='paid')return{status:'paid',kind:tx.kind};
  const data=await paystackFetch('/transaction/verify/'+encodeURIComponent(ref),secret);
  if(data.reference!==ref||data.currency!=='NGN'||data.domain!=='live'||!Number.isSafeInteger(data.amount)||data.amount!==tx.amount_kobo)fail('Payment details do not match. Contact the administrator.',422);
  if(data.status!=='success')return{status:'pending',kind:tx.kind};
  await q("UPDATE paystack_transactions SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE reference=? AND status!='paid'",ref).run();
  return{status:'paid',kind:tx.kind};
 }
 if(path==='webhook'){
  if(r.method!=='POST')fail('Method not allowed',405);const len=Number(r.headers.get('content-length')||0);if(len>262144)fail('Event too large.',413);const raw=await r.text();if(raw.length>262144)fail('Event too large.',413);if(!await verifiedWebhook(raw,r.headers.get('x-paystack-signature')||'',secret))fail('Invalid signature.',401);
  let event:any;try{event=JSON.parse(raw)}catch{fail('Invalid event.')}if(event.event!=='charge.success')return Response.json({ok:true});const ref=String(event.data?.reference||'');if(!validRef(ref)||!await one('SELECT reference FROM paystack_transactions WHERE reference=?',ref))return Response.json({ok:true});const result=await verify(ref);if(result.status!=='paid')fail('Payment is not yet verified.',503);return Response.json({ok:true});
 }
 if(r.method!=='POST')fail('Method not allowed',405);if(r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('Invalid origin',403);const auth=await getUser(r),uid=auth?.userId;if(!uid)fail('Please log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403);const b:any=await r.json();
 if(path==='verify')return Response.json(await verify(String(b.reference||''),uid));
 if(path==='initialize'){
  const id=String(b.id||'');if(!/^[a-f0-9-]{36}$/i.test(id))fail('Invalid payment request.');const ref='ec-'+id,kind=String(b.kind||''),existing=await one('SELECT * FROM paystack_transactions WHERE reference=?',ref);
  const requestData=JSON.stringify({kind,coins:Number(b.coins)||0,action:String(b.action||''),recipient:String(b.recipient||''),product:String(b.product||''),days:Number(b.days)||0,...(kind==='live'?{scheduled:Number(b.scheduled)||0}:{}),...(b.liveSession?{liveSession:String(b.liveSession)}:{})});
  if(existing){if(existing.buyer!==uid||existing.request_data!==requestData)fail('Payment request already exists.',409);if(existing.status==='paid')return Response.json({status:'paid',reference:ref});if(existing.checkout_url)return Response.json({status:'ready',reference:ref,authorization_url:existing.checkout_url});fail('This payment is still being prepared. Please try again shortly.',409)}
  const price=await getCoinPrice(db);if(Number(b.coinPrice)!==price)fail('The eCoin price changed. Refresh before continuing.',409);let coins=Number(b.coins),stmt:D1PreparedStatement;const extra:D1PreparedStatement[]=[];
  if(kind==='payment'){
   if(!normalPacks.includes(coins)||!['topup','gift','vote'].includes(b.action))fail('Choose a valid eCoin package.');const recipient=b.action==='topup'?uid:String(b.recipient||'');if(!await one('SELECT id FROM profiles WHERE id=?',recipient))fail('Member unavailable.');if(b.action==='gift'&&recipient===uid)fail('Choose another member.');if(b.action==='vote'&&!await one('SELECT user FROM contestants WHERE user=?',recipient))fail('Contestant unavailable.');
   stmt=q('INSERT INTO payments(id,buyer,recipient,coins,kind,amount_ngn) VALUES(?,?,?,?,?,?)',id,uid,recipient,coins,b.action,coinAmount(coins,price));
   if(b.liveSession){const live=await one("SELECT user FROM live_bookings WHERE id=? AND status='confirmed' AND scheduled<=? AND ends>? AND heartbeat>? AND closed=0",String(b.liveSession),Date.now(),Date.now(),Date.now()-45000);if(b.action!=='gift'||!live||live.user!==recipient)fail('This creator is not currently live.');extra.push(q('INSERT INTO live_gift_links(payment,booking) VALUES(?,?)',id,String(b.liveSession)))}
  }else if(kind==='live'){
   if(!env.STREAM_ACCOUNT_ID||!env.STREAM_API_TOKEN)fail('Come Live is not available yet. No payment has been taken.',503);const scheduled=Number(b.scheduled);if(!normalPacks.includes(coins)||!Number.isSafeInteger(scheduled)||scheduled<Date.now()+60000||scheduled>Date.now()+31536000000)fail('Choose a live date at least one minute ahead, within the next year.');if(await one("SELECT id FROM live_bookings WHERE user=? AND scheduled<? AND ends>?",uid,scheduled+coins*3600000,scheduled))fail('You already have a booking in this time period.');stmt=q("INSERT INTO live_bookings(id,user,scheduled,hours,ends,source,status,amount_ngn) VALUES(?,?,?,?,?,'paystack','pending',?)",id,uid,scheduled,coins,scheduled+coins*3600000,coinAmount(coins,price));
  }else if(kind==='investment'){
   if(!investmentPacks.includes(coins))fail('Choose a valid investment package.');stmt=q("INSERT INTO investments(id,user,coins,principal_points,interest_points,unit_price,amount_ngn,source) VALUES(?,?,?,?,?,?,?,'bank')",id,uid,coins,coins*100,coins*25,price,coinAmount(coins,price));
  }else if(kind==='promotion'){
   const days=Number(b.days),product=String(b.product||'')||null;if(![3,7,30].includes(days))fail('Choose a valid promotion.');if(product&&!await one('SELECT id FROM market_products WHERE id=? AND seller=? AND active=1',product,uid))fail('Product unavailable.');if(!product&&!await one('SELECT id FROM market_products WHERE seller=? AND active=1',uid))fail('Upload a product before promoting your shop.');coins=(product?{3:2,7:4,30:8}:{3:8,7:15,30:30})[days as 3|7|30];if(Number(b.coins)!==coins)fail('Promotion price changed. Refresh and try again.',409);stmt=q("INSERT INTO market_promotions(id,seller,product,days,coins,source,status,amount_ngn) VALUES(?,?,?,?,?,'bank','pending',?)",id,uid,product,days,coins,coinAmount(coins,price));
  }else return fail('Invalid payment type.');
  const amount=moneyKobo(coins,price);if(!Number.isSafeInteger(amount)||amount<=0)fail('Invalid payment amount.');
  await db.batch([stmt,...extra,q("INSERT INTO paystack_transactions(reference,buyer,kind,object_id,request_data,amount_kobo) VALUES(?,?,?,?,?,?)",ref,uid,kind,id,requestData,amount)]);
  let origin=url.origin;if(env.APP_ORIGIN){try{const configured=new URL(env.APP_ORIGIN);if(configured.protocol==='https:')origin=configured.origin}catch{}}
  const callback=origin+'/?paystack=1'+(kind==='live'?'&live=1':'');const init=await paystackFetch('/transaction/initialize',secret,'POST',{email:auth!.email,amount,currency:'NGN',reference:ref,callback_url:callback,metadata:{econect_kind:kind}});
  const authorization=checkoutUrl(String(init.authorization_url||''));if(!authorization||init.reference!==ref)fail('Paystack returned an invalid checkout. Contact the administrator.',502);
  await q("UPDATE paystack_transactions SET status='ready',checkout_url=? WHERE reference=? AND status='initializing'",authorization,ref).run();return Response.json({status:'ready',reference:ref,authorization_url:authorization});
 }
 return fail('Not found',404);
}catch(e:any){return Response.json({error:e.message?.includes('no such table')?'Paystack setup is pending. Complete the database migration.':e.message?.includes('UNIQUE')?'This payment request is already being processed.':e.message||'Payment could not be completed.'},{status:e.status||400})}}
