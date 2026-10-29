import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('server/post-preview.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {postPreview,sharedPost}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let post,requestedId,headKey;
const env={DB:{prepare(sql){assert.match(sql,/WHERE p.id=\?/);return{bind(id){requestedId=id;return{first:async()=>post}}}}},ASSETS:{fetch:async()=>new Response('<html><head><title>eConect</title><meta name="description" content="Generic"/></head><body><div id="root"></div></body></html>',{headers:{'Content-Type':'text/html','ETag':'old','Cache-Control':'public,max-age=3600'}})},BUCKET:{head:async key=>{headKey=key;return{httpMetadata:{contentType:'video/mp4'}}}}};
const req=(method='GET')=>new Request('https://econectapp.com/?post=a%26b&utm_source=test',{method});
post={name:'A <B>',surname:'',username:'creator',body:'A "photo" & story',media:JSON.stringify([{type:'image',url:'/api/media?key=public%2Fphoto'}])};
let response=await postPreview(req(),env),html=await response.text();assert.equal(requestedId,'a&b');assert.equal(response.status,200);assert.equal(response.headers.get('ETag'),null);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(html,/og:image" content="https:\/\/econectapp.com\/api\/media\?key=public%2Fphoto/);assert.match(html,/A &lt;B&gt; on eConect/);assert.match(html,/A &quot;photo&quot; &amp; story/);assert.doesNotMatch(html,/utm_source|favicon/);
post={...post,body:'Watch me',media:JSON.stringify([{type:'video',url:'/api/media?key=public%2Fclip',poster:'/api/media?key=public%2Fcover'}])};response=await postPreview(req(),env);html=await response.text();assert.equal(headKey,'public/clip');assert.match(html,/og:image" content="[^\"]*public%2Fcover/);assert.match(html,/og:video" content="[^\"]*public%2Fclip/);assert.match(html,/og:video:type" content="video\/mp4/);assert.match(html,/summary_large_image/);
post={...post,media:JSON.stringify([{type:'image',url:'/api/media?key=private%2Fsecret'},{type:'image',url:'https://evil.test/stolen'}])};html=await(await postPreview(req(),env)).text();assert.doesNotMatch(html,/og:image|private|evil.test/);
post={...post,media:'broken'};assert.equal((await postPreview(req(),env)).status,200);
post=null;response=await postPreview(req(),env);assert.equal(response.status,404);assert.match(await response.text(),/Post unavailable/);
response=await postPreview(req('HEAD'),env);assert.equal(await response.text(),'');
console.log('PASS: public photo/video previews, poster and MIME metadata, escaping, canonical URLs, private-media exclusion, malformed/deleted posts, cache headers and HEAD.');

post={id:'older-post',body:'Older public moment',media:'[]',likes:2,comments:1};response=await sharedPost(new Request('https://econectapp.com/api/shared-post?id=older-post'),env);assert.equal(response.status,200);assert.equal(requestedId,'older-post');assert.equal((await response.json()).id,'older-post');post=null;assert.equal((await sharedPost(new Request('https://econectapp.com/api/shared-post?id=deleted'),env)).status,404);console.log('PASS: exact shared-post lookup outside the latest feed and deleted-post response.');
