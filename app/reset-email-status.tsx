import {useEffect,useState} from 'react';
const issues:Record<string,string>={
 domain_unverified:'Resend rejected the sender domain. Verify the domain used by EMAIL_FROM in Resend → Domains, including its DNS records.',
 testing_only:'Resend is restricting emails to the account owner. Verify your sending domain and use an EMAIL_FROM address on that verified domain.',
 invalid_key:'Resend rejected the API key. Replace RESEND_API_KEY in Cloudflare Secrets with a valid key that has Sending access to your domain.',
 permission:'Resend denied permission. Check that the API key is allowed to send from the EMAIL_FROM domain.',
 rate_limit:'Resend temporarily limited sending. Wait briefly, then request a new reset link.',
 quota:'Resend reports that the email sending limit has been reached. Check your Resend usage and plan.',
 network:'The email service did not respond. Request a new link and check the result here.',
 provider_error:'Resend rejected the email. Check Resend → Emails and the Cloudflare Worker logs for the request.'
};
export function ResetEmailStatus(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setBusy(true);setError('');try{const r=await fetch('/api/auth/email-status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Unable to check email setup.');setData(d)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{void refresh()},[]);
 return <section className="admin-card card"><h3>Password reset email</h3><p className="muted">Request a reset link using your registered username or email, then refresh this status. Delivery details are visible only to administrators.</p>{data&&<><p><strong>API key:</strong> {data.hasKey?'Configured':'Missing'}<br/><strong>Sender:</strong> {data.from||'Missing'}<br/><strong>Site:</strong> {data.origin||'Missing'}</p>{!data.configured?<p role="alert">Complete RESEND_API_KEY, EMAIL_FROM and APP_ORIGIN in Cloudflare.</p>:data.last?<><p><strong>Last request:</strong> {new Date(data.last.at).toLocaleString()}</p>{data.last.state==='accepted'?<p>Resend accepted the email. Check Spam/Junk. In Resend → Emails, check whether it was delivered, delayed, bounced or suppressed.<br/><strong>Email ID:</strong> {data.last.id}</p>:<p role="alert">{issues[data.last.reason]||issues.provider_error}</p>}</>:<p>No email delivery attempt has been recorded yet. Check that the username or email matches a registered account.</p>}</>}{error&&<p role="alert">{error}</p>}<button className="secondary" disabled={busy} onClick={refresh}>{busy?'Checking…':'Refresh email status'}</button></section>
}
