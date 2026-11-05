import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('shared/youtube.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {youtubeVideo}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10','https://youtu.be/dQw4w9WgXcQ?si=share','https://youtube.com/shorts/dQw4w9WgXcQ','https://youtube.com/live/dQw4w9WgXcQ','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ','youtube.com/watch?v=dQw4w9WgXcQ','https://m.youtube.com/watch?v=dQw4w9WgXcQ']){
 const media=youtubeVideo(link);assert.equal(media.id,'dQw4w9WgXcQ');assert.equal(media.url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');assert.equal(media.poster,'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');assert.ok(media.embed.startsWith('https://www.youtube-nocookie.com/embed/'));
}
for(const link of ['',null,'javascript:alert(1)','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ','https://evil@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:8080/watch?v=dQw4w9WgXcQ','https://www.youtube.com/playlist?list=anything','https://youtube.com/watch?v=short','<iframe src="evil"></iframe>','https://youtube.com/watch?v=dQw4w9WgXcQ%22onload%3D'])assert.equal(youtubeVideo(link),null);
console.log('PASS: YouTube watch, Shorts, live, short and embed links normalize safely; injected HTML, wrong hosts, credentials, ports and malformed IDs are rejected.');
