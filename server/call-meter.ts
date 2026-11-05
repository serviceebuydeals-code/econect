// Billing and state change are one SQLite statement, including the transfer trigger.
// At most five seconds of stale presence can be billed after an abrupt network loss.
export async function meterCall(db:D1Database,id:string,now:number,finish=false,reason='ended'){
 const elapsed="CAST(max(0,(min(?1,min(caller_seen,recipient_seen)+5000)-connected_at))/1000 AS INTEGER)";
 const affordable="billed_seconds+CAST((SELECT balance+bonus FROM profiles WHERE id=caller)/20 AS INTEGER)";
 const target="max(billed_seconds,min("+elapsed+","+affordable+"))";
 const stop="(?2=1 OR expires<=?1 OR "+elapsed+">="+affordable+")";
 await db.prepare("UPDATE rtc_calls SET billed_seconds="+target+",status=CASE WHEN "+stop+" THEN 'ended' ELSE status END,ended=CASE WHEN "+stop+" THEN connected_at+"+target+"*1000 ELSE ended END,end_reason=CASE WHEN "+stop+" THEN CASE WHEN "+elapsed+">="+affordable+" THEN 'insufficient' ELSE ?3 END ELSE end_reason END WHERE id=?4 AND status='active' AND connected_at IS NOT NULL").bind(now,finish?1:0,reason,id).run();
 await db.prepare("UPDATE rtc_calls SET status='ended',ended=min(?1,expires),end_reason=?2 WHERE id=?3 AND status!='ended' AND connected_at IS NULL AND (?4=1 OR expires<=?1)").bind(now,reason,id,finish?1:0).run();
}
export async function expireCalls(env:Cloudflare.Env){
 const now=Date.now(),rows=(await env.DB.prepare("SELECT id FROM rtc_calls WHERE status!='ended' AND expires<=? LIMIT 100").bind(now).all<{id:string}>()).results;
 for(const row of rows)await meterCall(env.DB,row.id,now,true,'expired');
}
