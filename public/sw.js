// Push only: deliberately no fetch handler or application-shell cache.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const url=new URL(data.url||'/',self.location.origin);
 const target=url.origin===self.location.origin?url.pathname+url.search:'/';
 event.waitUntil(self.registration.showNotification(data.title||'eConect',{
  body:data.expires&&data.expires<Date.now()?'Open eConect to check your updates.':data.body||'You have a new update.',
  icon:'/icon-192.png',badge:'/notification-badge.png',tag:data.tag||'econect-update',
  silent:false,data:{url:target},renotify:true
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL(event.notification.data?.url||'/',self.location.origin);if(url.origin!==self.location.origin)return;
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const tab of tabs){if(new URL(tab.url).origin===url.origin){await tab.navigate(url.href);await tab.focus();return}}
  await self.clients.openWindow(url.href);
 })());
});
