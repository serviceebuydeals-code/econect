import {env} from 'cloudflare:workers';
import {getUser} from './auth';
import{getCoinPrice,coinAmount}from'./pricing';
const packs=[1,2,4,8,15,30,50,100,200,400,800,1500,3000,5000,10000,20000];
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const text=(v:any,n=150)=>String(v??'').trim().slice(0,n);
export async function wealthRoute(r:Request):Promise<Response>{try{
 const db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/wealth/'.length),auth=await getUser(r),uid=auth?.userId;
 const q=(s:string,...v:any[])=>db.prepare(s).bind(...v),one=(s:string,...v:any[])=>q(s,...v).first<any>(),all=async(s:string,...v:any[])=>(await q(s,...v).all()).results;
 const guard=async()=>{if(!uid)fail('Please log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403)};
 if(r.method==='GET'){
  if(path==='config')return Response.json({coinPrice:await getCoinPrice(db),packs,termDays:180,interestPercent:15,cashoutFeePercent:5,earlyCashout:true});
  await guard();
  if(path==='investments')return Response.json({now:Date.now(),investments:await all('SELECT * FROM investments WHERE user=? ORDER BY created DESC,rowid DESC',uid)});
  if(path==='admin'){if(!auth?.isAdmin)fail('Admin only.',403);return Response.json({now:Date.now(),investments:await all('SELECT i.*,p.username,p.name FROM investments i JOIN profiles p ON p.id=i.user ORDER BY i.created DESC,i.rowid DESC LIMIT 500')})}
  fail('Not found',404);
 }
 if(r.method!=='POST')fail('Method not allowed',405);await guard();if(r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('Invalid origin',403);const b:any=await r.json();
 if(path==='price'){
  if(!auth?.isAdmin)fail('Admin only.',403);const price=Number(b.naira);
  if(!Number.isFinite(price)||price<0.01||price>1e9||Math.abs(price*100-Math.round(price*100))>0.00001)fail('Enter a valid price in naira, with up to two decimal places.');
  await q("INSERT INTO settings(key,value) VALUES('ecoin_price',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify({naira:price})).run();return Response.json({coinPrice:price});
 }
 if(path==='invest'){
  const coins=Number(b.coins),source=b.source,key=text(b.id,80);if(!packs.includes(coins)||!['wallet','bank'].includes(source)||!key)fail('Choose an investment package and payment option.');
  const existing=await one('SELECT * FROM investments WHERE id=? AND user=?',key,uid);if(existing)return Response.json(existing);
  const price=await getCoinPrice(db);if(Number(b.coinPrice)!==price)fail('The eCoin price changed. Refresh this page before continuing.',409);
  if(source==='bank'&&!await one("SELECT value FROM settings WHERE key='bank'"))fail('Payments open when the administrator adds bank details.');
  await q('INSERT INTO investments(id,user,coins,principal_points,interest_points,unit_price,amount_ngn,source) VALUES(?,?,?,?,?,?,?,?)',key,uid,coins,coins*100,coins*15,price,coinAmount(coins,price),source).run();
  return Response.json(await one('SELECT * FROM investments WHERE id=? AND user=?',key,uid));
 }
 if(path==='payment-sent'){
  const reference=text(b.reference);if(!reference)fail('Enter your bank transfer reference.');
  await q("UPDATE investments SET reference=? WHERE id=? AND user=? AND status='pending' AND source='bank'",reference,text(b.id,80),uid).run();return Response.json({ok:true});
 }
 if(path==='admin-confirm'){
  if(!auth?.isAdmin)fail('Admin only.',403);if(!['confirm','reject'].includes(b.action))fail('Choose confirm or reject.');
  await q("UPDATE investments SET status=?,starts=CASE WHEN ?='confirm' THEN CURRENT_TIMESTAMP ELSE NULL END,matures=CASE WHEN ?='confirm' THEN datetime('now','+180 days') ELSE NULL END WHERE id=? AND status='pending'",b.action==='confirm'?'confirmed':'rejected',b.action,b.action,text(b.id,80)).run();return Response.json({ok:true});
 }
 if(path==='quote'){
  const p=await one('SELECT * FROM investments WHERE id=? AND user=?',text(b.id,80),uid);if(!p||p.status!=='confirmed')fail('This investment is not available for cashout.');
  const matured=p.matures<=new Date().toISOString().slice(0,19).replace('T',' '),interest=matured?p.interest_points:0,gross=p.principal_points+interest;
  return Response.json({principalPoints:p.principal_points,interestPoints:interest,feePoints:gross/20,payoutPoints:gross*19/20,matured,now:Date.now()});
 }
 if(path==='cashout'){
  const p=await one('SELECT * FROM investments WHERE id=? AND user=?',text(b.id,80),uid);if(!p)fail('Investment not found.',404);if(p.status==='cashed_out')return Response.json({ok:true,already:true,payoutPoints:p.payout_points});if(p.status!=='confirmed')fail('Wait for admin payment confirmation before cashing out.');
  // A single status transition calculates and credits the payout. Repeated/concurrent requests cannot pay twice.
  await q("UPDATE investments SET status='cashed_out',cashed_out=CURRENT_TIMESTAMP,fee_points=(principal_points+CASE WHEN matures<=CURRENT_TIMESTAMP THEN interest_points ELSE 0 END)/20.0,payout_points=(principal_points+CASE WHEN matures<=CURRENT_TIMESTAMP THEN interest_points ELSE 0 END)*19.0/20 WHERE id=? AND user=? AND status='confirmed'",p.id,uid).run();
  const paid=await one('SELECT payout_points,fee_points FROM investments WHERE id=? AND user=?',p.id,uid);return Response.json({ok:true,payoutPoints:paid.payout_points,feePoints:paid.fee_points});
 }
 return fail('Not found',404);
}catch(e:any){return Response.json({error:e.message?.includes('no such table')||e.message?.includes('no such column')?'Investment setup is pending. Deploy with npm run deploy to apply the database migration.':e.message?.includes('UNIQUE')?'This action has already been submitted. Refresh to view its status.':e.message||'Please try again.'},{status:e.status||400})}}
