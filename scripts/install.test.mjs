import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let active;
globalThis.__installHooks={
  useState(initial){const i=active.cursor++;if(!(i in active.states))active.states[i]=typeof initial==='function'?initial():initial;const context=active;return[context.states[i],value=>{context.states[i]=typeof value==='function'?value(context.states[i]):value}]},
  useRef(value){const i=active.cursor++;return active.refs[i]??={current:value}},
  useEffect(fn){const i=active.cursor++;if(!active.effects[i])active.pending.push(()=>{active.effects[i]={cleanup:fn()}})}
};
const source=readFileSync('app/install-app.tsx','utf8').replace(/import .* from 'react';/, 'const {useEffect,useRef,useState}=globalThis.__installHooks;').replace(/import .* from 'lucide-react';/,'').replace("import './install-app.css';",'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {useAppInstall}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function setup({ua='Android Chrome',standalone=false,ios=false}={}){
  globalThis.window=new EventTarget();const queries=new Map();window.matchMedia=q=>{if(!queries.has(q)){const media=new EventTarget();media.matches=standalone&&q.includes('standalone');queries.set(q,media)}return queries.get(q)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:ua,standalone:ios}});
  const context={cursor:0,states:[],refs:[],effects:[],pending:[]};
  return()=>{active=context;context.cursor=0;const state=useAppInstall();for(const fn of context.pending.splice(0))fn();return state};
}
function offer(outcome='accepted',fail=false){const event=new Event('beforeinstallprompt',{cancelable:true});let calls=0;event.prompt=()=>{calls++;return fail?Promise.reject(Error('unavailable')):Promise.resolve()};event.userChoice=Promise.resolve({outcome});window.dispatchEvent(event);assert.ok(event.defaultPrevented);assert.equal(calls,0,'must wait for a user tap');return()=>calls}
let render=setup(),state=render(),fallback=0;await state.install(()=>fallback++);assert.equal(fallback,1);
let calls=offer();await state.install(()=>fallback++);assert.equal(calls(),1);assert.equal(render().installed,true);assert.equal(fallback,1);
render=setup();state=render();calls=offer('dismissed');await state.install(()=>fallback++);assert.equal(render().installed,false);await render().install(()=>fallback++);assert.equal(calls(),1,'consumed event must never be reused');assert.equal(fallback,2);
calls=offer('accepted',true);await render().install(()=>fallback++);assert.equal(calls(),1);assert.equal(render().installing,false);assert.equal(fallback,3);
offer();window.dispatchEvent(new Event('appinstalled'));assert.equal(render().installed,true);
assert.equal(setup({standalone:true})().installed,true);assert.equal(setup({ua:'iPhone',ios:true})().installed,true);assert.equal(setup({ua:'eConectPlayPreview/0.1'})().installed,true);
console.log('PASS: user-initiated install prompt, one-use events, acceptance, dismissal, failure fallback, appinstalled and installed Android/iOS suppression.');
