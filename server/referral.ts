import {env} from 'cloudflare:workers';
import {getUser} from './auth';
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const code=(v:any)=>String(v??'').trim().replace(/^@/,'').toLowerCase();
function validDate(v:any){const x=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const d=new Date(x+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===x}
export async function referralRoute(r:Request):Promise<Response>{try{
 const db=env.DB,url=new URL(r.url),path=url.pathname.slice('/api/referral/'.length),auth=await getUser(r),uid=auth?.userId;
 const q=(s:string,...v:any[])=>db.prepare(s).bind(...v),one=(s:string,...v:any[])=>q(s,...v).first<any>(),all=async(s:string,...v:any[])=>(await q(s,...v).all()).results;
 if(r.method==='GET'&&path==='check'){
  const username=code(url.searchParams.get('username')),ref=code(url.searchParams.get('code'));
  if(!/^[a-z0-9_]{3,24}$/.test(username))fail('Use 3–24 letters, numbers or underscores for your username.');
  if(await one('SELECT id FROM profiles WHERE username=? COLLATE NOCASE',username))fail('This username is already in use. Please choose another.');
  if(ref&&!await one("SELECT p.id FROM profiles p JOIN referral_programs r ON r.referrer=p.id WHERE p.username=? COLLATE NOCASE AND r.enabled=1 AND r.starts_on<=date('now','+1 hours') AND r.expires_on>=date('now','+1 hours')",ref))fail('Referral code is not active. Check the code or leave it blank.');
  return Response.json({ok:true});
 }
 if(!uid)fail('Please log in to continue.',401);if(!await one('SELECT id FROM profiles WHERE id=?',uid))fail('Create your profile first.',403);
 if(r.method==='GET'){
  if(path==='me')return Response.json({program:await one("SELECT p.username,r.*,CASE WHEN r.enabled=0 THEN 'disabled' WHEN r.starts_on>date('now','+1 hours') THEN 'scheduled' WHEN r.expires_on<date('now','+1 hours') THEN 'expired' ELSE 'active' END status FROM referral_programs r JOIN profiles p ON p.id=r.referrer WHERE r.referrer=?",uid),referredCount:(await one('SELECT count(*) n FROM referral_relationships WHERE referrer=?',uid)).n,totalPoints:(await one('SELECT COALESCE(sum(points),0) n FROM referral_rewards WHERE referrer=?',uid)).n,rewards:await all('SELECT r.points,r.purchased_coins,r.created,p.username FROM referral_rewards r JOIN profiles p ON p.id=r.referred WHERE r.referrer=? ORDER BY r.created DESC,r.rowid DESC LIMIT 50',uid)});
  if(path==='admin'){if(!auth?.isAdmin)fail('Admin only.',403);return Response.json(await all("SELECT p.username,p.name,r.*,CASE WHEN r.enabled=0 THEN 'disabled' WHEN r.starts_on>date('now','+1 hours') THEN 'scheduled' WHEN r.expires_on<date('now','+1 hours') THEN 'expired' ELSE 'active' END status,(SELECT count(*) FROM referral_relationships WHERE referrer=p.id) referred_count,(SELECT COALESCE(sum(points),0) FROM referral_rewards WHERE referrer=p.id) reward_points FROM referral_programs r JOIN profiles p ON p.id=r.referrer ORDER BY r.updated DESC,p.username"))}
  return fail('Not found',404);
 }
 if(r.method!=='POST')fail('Method not allowed',405);if(r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('Invalid origin',403);if(!auth?.isAdmin)fail('Admin only.',403);const b:any=await r.json();
 if(path==='admin'){
  const username=code(b.username),p=await one('SELECT id,username FROM profiles WHERE username=? COLLATE NOCASE',username);if(!p)fail('Registered username not found.');
  if(b.disable===true){await q('UPDATE referral_programs SET enabled=0,updated=CURRENT_TIMESTAMP WHERE referrer=?',p.id).run();return Response.json({ok:true})}
  if(!validDate(b.startsOn)||!validDate(b.expiresOn)||b.startsOn>b.expiresOn)fail('Choose a valid start date and expiry date on or after the start date.');
  await q('INSERT INTO referral_programs(referrer,starts_on,expires_on,enabled) VALUES(?,?,?,1) ON CONFLICT(referrer) DO UPDATE SET starts_on=excluded.starts_on,expires_on=excluded.expires_on,enabled=1,updated=CURRENT_TIMESTAMP',p.id,b.startsOn,b.expiresOn).run();return Response.json({ok:true});
 }
 return fail('Not found',404);
}catch(e:any){return Response.json({error:e.message?.includes('no such table')?'Referral setup is pending. Complete the database migration.':e.message?.includes('UNIQUE')?'This username is already in use. Please choose another.':e.message||'Please try again.'},{status:e.status||400})}}
