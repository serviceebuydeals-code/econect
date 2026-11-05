// Push only: deliberately no fetch handler or application-shell cache.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const isCall=data.kind==='call'&&(!data.expires||data.expires>Date.now());
 const url=new URL(data.url||'/',self.location.origin);
 const target=url.origin===self.location.origin?url.pathname+url.search:'/';
 event.waitUntil(self.registration.showNotification(data.kind==='call'&&!isCall?'Missed call':data.title||'eConect',{
  body:data.expires&&data.expires<Date.now()?'Open eConect to check your updates.':data.body||'You have a new update.',
  icon:'/icon-192.png',badge:'/notification-badge.png',tag:data.tag||'econect-update',
  silent:false,data:{url:target,kind:data.kind,callId:data.callId},renotify:true,
  ...(isCall?{requireInteraction:true,vibrate:[700,200,700,200,700],actions:[{action:'open-call',title:'Open call'},{action:'decline-call',title:'Decline'}]}:{})
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  if(event.action==='decline-call'&&/^[a-f0-9-]{36}$/i.test(event.notification.data?.callId||'')){try{const r=await fetch('/api/calls/hangup',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:event.notification.data.callId})});if(r.ok)return}catch{}}
  const url=new URL(event.notification.data?.url||'/',self.location.origin);if(url.origin!==self.location.origin)return;
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const tab of tabs){if(new URL(tab.url).origin===url.origin){await tab.navigate(url.href);await tab.focus();return}}
  await self.clients.openWindow(url.href);
 })());
});
