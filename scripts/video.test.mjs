import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('app/video-processing.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {validClip,uploadVideoAsset,recordingType,videoBitrate,VIDEO_LIMIT_BYTES}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
assert.equal(validClip(120,30,90),true);for(const args of [[120,0,61],[20,10,5],[20,-1,10],[20,0,21],[Infinity,0,20],[20,0,NaN]])assert.equal(validClip(...args),false);
assert.equal(recordingType(),'');assert.equal(VIDEO_LIMIT_BYTES,10000000);for(const seconds of [1,15,30,60]){const rate=videoBitrate(seconds);assert.ok(rate>=125000&&rate<=2500000);assert.ok((rate+96000)*seconds/8<VIDEO_LIMIT_BYTES)}assert.ok(videoBitrate(60,.6)<videoBitrate(60));
let mode='success',last;
globalThis.XMLHttpRequest=class{upload={};constructor(){last=this}open(method,url){assert.equal(method,'POST');assert.equal(url,'/api/upload')}send(form){assert.ok(form.get('file') instanceof File);assert.equal(form.get('kind'),'post');if(mode==='wait')return;this.upload.onprogress({lengthComputable:true,loaded:50,total:100});this.upload.onprogress({lengthComputable:true,loaded:100,total:100});if(mode==='network'){this.onerror();return}if(mode==='timeout'){this.ontimeout();return}this.status=mode==='bad'?413:200;this.responseText=mode==='invalid'?'not json':JSON.stringify(mode==='bad'?{error:'Video must be 10 MB or smaller.'}:{url:'/api/media?key=public%2Fvideo',type:'video'});this.onload()}abort(){this.onabort?.()}};
let progress=[];const result=await uploadVideoAsset(new Blob(['clip'],{type:'video/mp4'}),'video.mp4',n=>progress.push(n),new AbortController().signal);assert.equal(result.type,'video');assert.deepEqual(progress,[0,50,99,100]);
for(const failure of ['bad','invalid','network','timeout']){mode=failure;await assert.rejects(uploadVideoAsset(new Blob(['x']),'clip.mp4',()=>{},new AbortController().signal))}
mode='wait';const controller=new AbortController(),cancelled=uploadVideoAsset(new Blob(['x']),'clip.mp4',()=>{},controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
const already=new AbortController();already.abort();await assert.rejects(uploadVideoAsset(new Blob(['x']),'clip.mp4',()=>{},already.signal),{name:'AbortError'});
delete globalThis.XMLHttpRequest;
console.log('PASS: trim bounds, codec fallback, measured upload progress, server errors, network failure, timeout and cancellation.');
