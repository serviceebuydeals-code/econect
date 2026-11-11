import PostalMime from 'postal-mime';
import {getMailConfig,mailPlainText} from './mail';
const limit=25*1024*1024,previewLimit=5*1024*1024;
export async function receiveCloudflareMail(message:ForwardableEmailMessage,env:Cloudflare.Env){
 const c=await getMailConfig(env.DB),to=message.to.trim().toLowerCase();
 if(to!==c.address){message.setReject('This address is not configured in eConect Mail.');return}
 if(message.rawSize>limit){message.setReject('Email is larger than 25 MiB.');return}
 const chunks:Uint8Array[]=[];let size=0;const reader=message.raw.getReader();
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();message.setReject('Email is larger than 25 MiB.');return}chunks.push(part.value)}}finally{reader.releaseLock()}
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
 // Transport headers change across SMTP retries. Dedupe stable message content
 // rather than trusting Message-ID alone or hashing Cloudflare's Received headers.
 let bodyStart=0;for(let i=0;i<raw.length-1;i++){if(raw[i]===10&&raw[i+1]===10){bodyStart=i+2;break}if(i+3<raw.length&&raw[i]===13&&raw[i+1]===10&&raw[i+2]===13&&raw[i+3]===10){bodyStart=i+4;break}}
 const stable=[message.from,to,...['message-id','subject','date','from','reply-to','content-type','content-transfer-encoding'].map(k=>message.headers.get(k)||'')].join('\n');
 const prefix=new TextEncoder().encode(stable+'\n'),bodyBytes=raw.subarray(bodyStart),fingerprint=new Uint8Array(prefix.length+bodyBytes.length);fingerprint.set(prefix);fingerprint.set(bodyBytes,prefix.length);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',fingerprint)),v=>v.toString(16).padStart(2,'0')).join(''),id='cf:'+digest;
 if(await env.DB.prepare('SELECT id FROM admin_mail_messages WHERE id=?').bind(id).first())return;
 const rawKey='private/admin-mail/'+digest+'/original.eml';
 await env.BUCKET.put(rawKey,raw,{httpMetadata:{contentType:'message/rfc822'}});
 let sender=message.from.slice(0,320),subject=(message.headers.get('subject')||'(No subject)').slice(0,998),body='This message is too large for the text preview. Download the original email to read it and its attachments.',reply=message.from,attachments:{filename:string,content_type:string,key:string}[]=[];
 if(size<=previewLimit){
  try{const parsed=await PostalMime.parse(raw);
   if(parsed.from?.address)sender=(parsed.from.name?parsed.from.name+' <':'')+parsed.from.address+(parsed.from.name?'>':'');
   reply=parsed.replyTo?.[0]?.address||parsed.from?.address||message.from;
   subject=(parsed.subject||subject).slice(0,998);body=String(parsed.text||mailPlainText(parsed.html||'')||'(No text content)').slice(0,200000);
   for(const [i,file] of (parsed.attachments||[]).slice(0,100).entries()){
    const key='private/admin-mail/'+digest+'/attachment-'+i,content=file.content;
    await env.BUCKET.put(key,content,{httpMetadata:{contentType:'application/octet-stream'}});
    attachments.push({filename:String(file.filename||'attachment-'+(i+1)).slice(0,200),content_type:String(file.mimeType||'application/octet-stream').slice(0,100),key});
   }
  }catch{body='The text preview could not be decoded. Download the original email to read this message.'}
 }
 await env.DB.prepare("INSERT OR IGNORE INTO admin_mail_messages(id,direction,mailbox,sender,recipient,subject,body,attachments,provider_id,status,created_ms,provider,raw_key,reply_address) VALUES(?,'in',?,?,?,?,?,?,?,'received',?,'cloudflare',?,?)").bind(id,to,sender.slice(0,320),to,subject,body,JSON.stringify(attachments),id,Date.now(),rawKey,reply.slice(0,254)).run();
}
