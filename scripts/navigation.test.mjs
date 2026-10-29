import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
let active;
const hooks={useRef(value){const n=active.cursor++;return active.refs[n]??=( {current:value})},useEffect(fn,deps){const n=active.cursor++,old=active.effects[n];if(!old||deps.some((d,i)=>d!==old.deps[i]))active.pending.push(()=>{old?.cleanup?.();active.effects[n]={deps,cleanup:fn()}})}};
globalThis.__navigationHooks=hooks;
const code=ts.transpileModule(readFileSync('app/device-navigation.ts','utf8').replace("import {useEffect,useRef} from 'react';","const {useEffect,useRef}=globalThis.__navigationHooks;"),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {useDeviceNavigation,useDeviceBackLayer}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function runner(fn){const context={cursor:0,refs:[],effects:[],pending:[]};return(...args)=>{active=context;context.cursor=0;const value=fn(...args);for(const effect of context.pending.splice(0))effect();return value}}
globalThis.window=new EventTarget();globalThis.location=new URL('https://econect.test/');let stack=[{state:null,url:'/'}],index=0;
const setUrl=url=>{globalThis.location=new URL(url||location.href,location)};
globalThis.history={get state(){return stack[index].state},replaceState(state,_,url){stack[index]={state:structuredClone(state),url:url||location.pathname+location.search};setUrl(url)},pushState(state,_,url){stack=stack.slice(0,index+1);stack.push({state:structuredClone(state),url:url||location.pathname+location.search});index++;setUrl(url)},back(){if(index===0)throw Error('Navigation left the site');index--;setUrl(stack[index].url);const event=new Event('popstate');event.state=this.state;window.dispatchEvent(event)},forward(){if(index+1<stack.length){index++;setUrl(stack[index].url);const event=new Event('popstate');event.state=this.state;window.dispatchEvent(event)}}};
const home={page:'Home',modal:'',profilePage:null,chat:null,shop:'',marketProduct:'',adminTab:'Overview',selected:null};let route={...home};const render=runner(()=>useDeviceNavigation(route,next=>{route=next},true));render();assert.equal(stack.length,2);
route={...route,page:'Gift Club'};render();route={...route,page:'Wallet'};render();assert.equal(stack.length,4);
history.back();render();assert.equal(route.page,'Gift Club');assert.equal(stack.length,4);history.forward();render();assert.equal(route.page,'Wallet');assert.equal(stack.length,4);
route={...route,page:'Messages',chat:null};render();route={...route,chat:{id:'friend-chat'}};render();history.back();render();assert.equal(route.page,'Messages');assert.equal(route.chat,null);
route={...route,page:'Profile',profilePage:{id:'member',name:'Original'}};render();const before=stack.length;route={...route,profilePage:{id:'member',name:'Updated'}};render();assert.equal(stack.length,before);
route={...route,modal:'image',selected:{items:[{url:'/photo'}],index:0}};render();history.back();render();assert.equal(route.modal,'');assert.equal(route.page,'Profile');
route={...home,page:'Marketplace',shop:'my-shop'};render();assert.equal(location.pathname,'/shop/my-shop');history.back();render();assert.equal(route.page,'Profile');
for(let i=0;i<20;i++){history.back();render()}assert.equal(route.page,'Home');assert.equal(location.pathname,'/');
let closed=0;const layer=runner(()=>useDeviceBackLayer(()=>closed++));const close=layer();close();assert.equal(closed,1);
// Reloading an existing Home entry must not swallow the next navigation.
let reloadRoute={...home};const reloaded=runner(()=>useDeviceNavigation(reloadRoute,r=>{reloadRoute=r},true));reloaded();const reloadBefore=index;reloadRoute={...reloadRoute,page:'Gift Club'};reloaded();assert.equal(index,reloadBefore+1);
console.log('PASS: device Back/Forward, chat-to-list, modal dismissal, stable background updates, shop URLs, Home exit guard, live layers and navigation after reload.');
