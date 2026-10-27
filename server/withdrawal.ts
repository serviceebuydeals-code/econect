import {env} from 'cloudflare:workers';
import {getUser} from './auth';
import{getCoinPrice}from'./pricing';
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const text=(v:any,n=150)=>String(v??'').trim().slice(0,n);
function unitsFromAmount(value:any){
 const raw=String(value??'').trim();if(!/^\d{1,10}(\.\d{1,4})?$/.test(raw))return fail('Enter an eCoin amount with up to 4 decimal places.');
 const [whole,part='']=raw.split('.'),u=BigInt(whole)*10000n+BigInt(part.padEnd(4,'0'));if(u<=0n||u>BigInt(Number.MAX_SAFE_INTEGER))return fail('Enter a valid eCoin amount.');return Number(u);
}
function quote(units:number,price:number){
 const priceKobo=Math.round(price*100),gross=(BigInt(units)*BigInt(priceKobo)+5000n)/10000n;if(gross<10n||gross>100000000000000n)fail('Withdrawal value must be between ₦0.10 and ₦1 trillion.');
 const fee=(gross+5n)/10n;return {coin_units:units,price_kobo:priceKobo,gross_kobo:Number(gross),fee_kobo:Number(fee),net_kobo:Number(gross-fee)};
}
export async function withdrawalRoute(r:Request):Promise<Response>{try{
 const db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/withdrawal/'.length),auth=await getUser(r),uid=auth?.userId;
 const q=(s:string,...v:any[])=>db.prepare(s).bind(...v),one=(s:string,...v:any[])=>q(s,...v).first<any>(),all=async(s:string,...v:any[])=>(await q(s,...v).all()).results;
 if(!uid)fail('Please log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403);
 if(r.method==='GET'){
  if(path==='mine')return Response.json(await all('SELECT * FROM wallet_withdrawals WHERE user=? ORDER BY created DESC,rowid DESC',uid));
  if(path==='admin'){if(!auth?.isAdmin)fail('Admin only.',403);const status=url.searchParams.get('status')||'pending',page=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('page'))||0)));if(!['pending','processing','paid','rejected'].includes(status))fail('Invalid status.');const rows=await all('SELECT w.*,p.username,p.name FROM wallet_withdrawals w JOIN profiles p ON p.id=w.user WHERE w.status=? ORDER BY w.created DESC,w.rowid DESC LIMIT 100 OFFSET ?',status,page*100);const count=await one('SELECT COUNT(*) total FROM wallet_withdrawals WHERE status=?',status);const total=await one("SELECT COALESCE(SUM(fee_kobo),0) total FROM wallet_withdrawals WHERE status='paid'");return Response.json({rows:rows.map((w:any)=>({...w,can_process:w.admin_user===uid})),paidFeesKobo:total.total,hasMore:(page+1)*100<count.total})}
  return fail('Not found',404);
 }
 if(r.method!=='POST')fail('Method not allowed',405);if(r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('Invalid origin',403);const b:any=await r.json();
 if(path==='quote'||path==='request'){
  const key=text(b.id,80);if(path==='request'){if(!key)fail('Please submit the withdrawal again.');const old=await one('SELECT * FROM wallet_withdrawals WHERE id=? AND user=?',key,uid);if(old)return Response.json(old)}
  const units=unitsFromAmount(b.amount),price=await getCoinPrice(db);if(b.coinPrice!==undefined&&Number(b.coinPrice)!==price)fail('The eCoin price changed. Refresh before continuing.',409);
  const a=quote(units,price);if(path==='quote')return Response.json(a);
  const bankName=text(b.bankName,120),accountName=text(b.accountName,120),accountNumber=text(b.accountNumber,40).replace(/\s+/g,'').toUpperCase();
  if(!bankName||!accountName||!/^[A-Z0-9]{6,34}$/.test(accountNumber))fail('Enter the bank name, account name and a valid account number.');
  await q('INSERT INTO wallet_withdrawals(id,user,coin_units,price_kobo,gross_kobo,fee_kobo,net_kobo,bank_name,account_name,account_number) VALUES(?,?,?,?,?,?,?,?,?,?)',key,uid,units,a.price_kobo,a.gross_kobo,a.fee_kobo,a.net_kobo,bankName,accountName,accountNumber).run();
  return Response.json(await one('SELECT * FROM wallet_withdrawals WHERE id=? AND user=?',key,uid));
 }
 if(path==='admin-action'){
  if(!auth?.isAdmin)fail('Admin only.',403);const action=b.action,key=text(b.id,80),reference=text(b.reference,150);if(!['start','release','paid','rejected'].includes(action))fail('Choose a valid action.');
  if(action==='paid'&&!reference)fail('Enter the bank transfer reference after sending the payment.');
  let result:any;
  if(action==='start')result=await q("UPDATE wallet_withdrawals SET status='processing',admin_user=? WHERE id=? AND status='pending'",uid,key).run();
  else if(action==='release')result=await q("UPDATE wallet_withdrawals SET status='pending',admin_user=NULL WHERE id=? AND status='processing' AND admin_user=?",key,uid).run();
  else if(action==='paid')result=await q("UPDATE wallet_withdrawals SET status='paid',completed=CURRENT_TIMESTAMP,transfer_reference=? WHERE id=? AND status='processing' AND admin_user=?",reference,key,uid).run();
  else result=await q("UPDATE wallet_withdrawals SET status='rejected',completed=CURRENT_TIMESTAMP,admin_user=? WHERE id=? AND (status='pending' OR (status='processing' AND admin_user=?))",uid,key,uid).run();
  if(!result.meta.changes){const current=await one('SELECT status,admin_user FROM wallet_withdrawals WHERE id=?',key);if(!current)fail('Withdrawal not found.',404);const completed=(action==='start'&&current.status==='processing'&&current.admin_user===uid)||(action==='release'&&current.status==='pending')||(['paid','rejected'].includes(action)&&current.status===action&&current.admin_user===uid);if(!completed)fail('This withdrawal is already being processed or has been completed. Refresh the list.',409)}
  return Response.json({ok:true});
 }
 return fail('Not found',404);
}catch(e:any){return Response.json({error:e.message?.includes('no such table')?'Withdrawal setup is pending. Complete the database migration before using this feature.':e.message?.includes('UNIQUE')?'This withdrawal has already been submitted. Refresh to see its status.':e.message||'Please try again.'},{status:e.status||400})}}
