import {useEffect,useState} from 'react';
async function request(path:string,body?:any){const r=await fetch('/api/push/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const d:any=await r.json();if(!r.ok)throw new Error(d.error||'Notification setup failed.');return d}
const registration=()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready);
export async function disableDevicePush(){if(!('serviceWorker'in navigator))return;const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager?.getSubscription();if(sub){await request('disable',{endpoint:sub.endpoint});await sub.unsubscribe()}for(const n of await reg?.getNotifications()||[])n.close()}
export function PushNotifications({user}:{user:string}){
 const supported=typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window&&!/eConectPlayPreview\//.test(navigator.userAgent);
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{let active=true;if(supported)registration().then(r=>r.pushManager.getSubscription()).then(async sub=>{if(sub&&active){const d=await request('status',{endpoint:sub.endpoint});if(active)setEnabled(d.enabled&&Notification.permission==='granted')}}).catch(()=>{});return()=>{active=false}},[user,supported]);
 async function action(kind:string){setBusy(true);setStatus('');try{
  if(kind==='disable'){await disableDevicePush();setEnabled(false);setStatus('Notifications turned off on this device.')}
  else if(kind==='test'){const sub=await(await registration()).pushManager.getSubscription();if(!sub)throw new Error('Enable notifications first.');await request('test',{endpoint:sub.endpoint});setStatus('Test queued. Close the app; the notification should arrive within a minute.')}
  else{
   // Permission must be requested directly from this user gesture, especially on iOS.
   if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your phone’s settings, then try again.');
   const key=await request('key'),reg=await registration();
   let sub=await reg.pushManager.getSubscription();if(!sub){const raw=atob(key.publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))})}
   await request('subscribe',sub.toJSON());setEnabled(true);setStatus('Enabled on this device. Your phone controls notification sounds and Do Not Disturb.');
  }
 }catch(e:any){setStatus(e.message)}finally{setBusy(false)}}
 return <section className="card" style={{padding:20,marginBottom:20}}><h3>Device notifications</h3><p>Get alerts for messages, calls and activity even when eConect is closed. Your phone controls the alert sound.</p>{supported?<><button className="primary" disabled={busy} onClick={()=>action(enabled?'disable':'enable')}>{busy?'Please wait…':enabled?'Turn off notifications':'Enable notifications'}</button> {enabled&&<button className="secondary" disabled={busy} onClick={()=>action('test')}>Test notification</button>}</>:<p>Install eConect from Chrome on Android, or use Safari → Share → Add to Home Screen on iPhone, then open it from your Home Screen. The Android preview APK needs a separate notification update.</p>}{status&&<p role="status">{status}</p>}</section>
}
