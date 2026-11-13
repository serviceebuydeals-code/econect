import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '};
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g,x=>entities[x]);
export function localizeSource(code,id,keys){
 const file=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 const attrs=new Set(['placeholder','title','aria-label','alt','label','sub']);
 function walk(node,blocked=false){
  const tag=ts.isJsxElement(node)?node.openingElement.tagName.getText(file):'';
  const stop=blocked||['script','style','code','pre'].includes(tag);
  if(!stop&&ts.isJsxElement(node)&&tag==='option'&&!node.openingElement.attributes.properties.some(p=>p.name?.getText(file)==='value')){
   const text=node.children.every(c=>ts.isJsxText(c))?decode(node.children.map(c=>c.text).join('')).replace(/\s+/g,' ').trim():'';
   if(keys.has(text))edits.push({start:node.openingElement.end-1,end:node.openingElement.end-1,text:' value='+JSON.stringify(text)});
  }
  if(!stop&&ts.isJsxText(node)){
   const raw=node.text,key=decode(raw).replace(/\s+/g,' ').trim();if(keys.has(key)){const prefix=/^\s/.test(raw)&&!raw.includes('\n')?' ':'',suffix=/\s$/.test(raw)&&!raw.includes('\n')?' ':'';
    edits.push({start:node.pos,end:node.end,text:'{'+JSON.stringify(prefix)+'+__econectT('+JSON.stringify(key)+')+'+JSON.stringify(suffix)+'}'});
   }
  }
  if(!stop&&ts.isJsxAttribute(node)&&attrs.has(node.name.getText(file))&&node.initializer&&ts.isStringLiteral(node.initializer)){
   const key=decode(node.initializer.text);if(keys.has(key))edits.push({start:node.initializer.getStart(file),end:node.initializer.end,text:'{__econectT('+JSON.stringify(key)+')}'});
  }
  ts.forEachChild(node,child=>walk(child,stop));
 }walk(file);
 if(!edits.length)return null;
 edits.sort((a,b)=>b.start-a.start);let output=code;for(const e of edits)output=output.slice(0,e.start)+e.text+output.slice(e.end);
 let path=relative(dirname(id),resolve(process.cwd(),'app/i18n')).replace(/\\/g,'/');if(!path.startsWith('.'))path='./'+path;
 return "import {t as __econectT} from "+JSON.stringify(path)+";\n"+output;
}
export default function localization(){const keys=new Set(Object.keys(JSON.parse(readFileSync(resolve(process.cwd(),'shared/translations.json'),'utf8'))));
 return{name:'econect-interface-localization',enforce:'pre',transform(code,id){if(!id.replace(/\\/g,'/').includes('/app/')||!id.endsWith('.tsx')||id.endsWith('/i18n.tsx'))return null;const output=localizeSource(code,id,keys);return output?{code:output,map:null}:null}};
}
