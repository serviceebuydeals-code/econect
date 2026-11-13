import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let cursor=0,refs=[],effects=[],pending=[];
globalThis.__chatHooks={useRef(value){return refs[cursor++]??={current:value}},useLayoutEffect(fn,deps){const n=cursor++,old=effects[n];if(!old||deps.some((v,i)=>v!==old.deps[i]))pending.push(()=>{old?.cleanup?.();effects[n]={deps,cleanup:fn()}})}};
let resize,disconnected=0;globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}disconnect(){disconnected++}};
const source=readFileSync('app/chat-scroll.ts','utf8').replace("import {useLayoutEffect,useRef} from 'react';",'const {useLayoutEffect,useRef}=globalThis.__chatHooks;');
const {useChatScroll,useChatViewport}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const box=new EventTarget();Object.assign(box,{scrollTop:0,scrollHeight:1000,clientHeight:300});
function render(id,messages){cursor=0;const state=useChatScroll(id,messages,'me');state.viewport.current=box;state.content.current={};for(const fn of pending.splice(0))fn();return state}
render('alice',undefined);render('alice',[{id:'1',sender:'alice'}]);assert.equal(box.scrollTop,1000,'loaded conversation starts at latest message');
box.scrollTop=100;box.dispatchEvent(new Event('scroll'));render('alice',[{id:'1',sender:'alice'},{id:'2',sender:'alice'}]);assert.equal(box.scrollTop,100,'incoming polling does not interrupt older history');box.scrollHeight=1200;resize();assert.equal(box.scrollTop,100,'media loading preserves reading position');
render('alice',[{id:'1',sender:'alice'},{id:'2',sender:'alice'},{id:'3',sender:'me'}]);assert.equal(box.scrollTop,1200,'sending reveals own message');box.scrollHeight=1500;resize();assert.equal(box.scrollTop,1500,'late media stays pinned');
box.scrollTop=0;box.dispatchEvent(new Event('scroll'));render('bob',[{id:'4',sender:'bob'}]);assert.equal(box.scrollTop,1500,'switching people resets to latest');assert.ok(disconnected);render(undefined,undefined);assert.ok(disconnected>=2);
const page=readFileSync('app/page.tsx','utf8');assert.match(page,/page==='Notifications'\|\|/);assert.match(page,/\[page,me\?\.id,notificationVisit\]/);assert.ok(page.indexOf('className="card activity-inbox"')<page.indexOf('<PushNotifications user={me.id}'));assert.match(readFileSync('app/globals.css','utf8'),/max-width:760px\)\{\.mobile-conversation>\.remaining-balance,\.mobile-conversation>\.page-heading\{display:none\}/);
console.log('PASS: chat starts at latest, respects history reading, follows own/new messages and late media, resets between people, and mobile chat hides balance/intro. Notifications refresh on entry and appear above device setup.');

refs=[];effects=[];pending=[];cursor=0;globalThis.window=new EventTarget();window.matchMedia=()=>({matches:true});window.innerHeight=800;window.visualViewport=new EventTarget();Object.assign(window.visualViewport,{height:800,offsetTop:0});globalThis.document={querySelector:()=>({getBoundingClientRect:()=>({bottom:65})})};
const properties=new Map(),frame={style:{setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)}};
const frameRef=useChatViewport(true);frameRef.current=frame;for(const fn of pending.splice(0))fn();assert.equal(properties.get('--chat-height'),'735px');window.visualViewport.height=420;window.visualViewport.dispatchEvent(new Event('resize'));assert.equal(properties.get('--chat-height'),'355px','reply box fits above keyboard');window.matchMedia=()=>({matches:false});window.dispatchEvent(new Event('resize'));assert.equal(properties.has('--chat-height'),false,'desktop layout stays unchanged');assert.ok(!page.includes('<LanguageControls/>'));console.log('PASS: mobile conversation fits the visible screen and keyboard; language bar removed.');
