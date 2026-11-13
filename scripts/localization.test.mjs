import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {localizeSource} from '../build/localization.mjs';
const load=async code=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{fileName:'module.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64'));
const countries=JSON.parse(readFileSync('shared/geo-countries.json')),index=JSON.parse(readFileSync('shared/geo-index.json'));
const geo=await load(readFileSync('shared/geography.ts','utf8').replace("import countries from './geo-countries.json';",'const countries='+JSON.stringify(countries)+';'));
assert.ok(countries.length>=240);assert.equal(geo.countryFor('United States').code,'US');assert.equal(geo.countryFor('Côte d’Ivoire').code,'CI');assert.equal(geo.countryFor('unknown'),null);
for(const code of ['FR','DE','IN','KE','US','NG','BJ'])assert.ok(index[code].regions.length);
const request=new Request('https://econect.test',{headers:{'cf-ipcountry':'NG'}});assert.equal(geo.requestCountry(request),null);assert.equal(geo.preferredMarketCountry(request,'Ghana').code,'GH');Object.defineProperty(request,'cf',{value:{country:'FR'}});assert.equal(geo.preferredMarketCountry(request,'Ghana').code,'FR');
const geoSource=readFileSync('shared/geography.ts','utf8').replace("import countries from './geo-countries.json';",'const countries='+JSON.stringify(countries)+';').replace(/export /g,'');
const locations=await load(readFileSync('server/locations.ts','utf8').replace("import regions from '../shared/geo-index.json';",'const regions='+JSON.stringify(index)+';').replace("import {countryFor,countryList,requestCountry} from '../shared/geography';",geoSource));
const bytes=readFileSync('public/geo/cities.dat');
for(const ranged of [true,false]){
 const env={ASSETS:{fetch:async r=>{const [,start,end]=/bytes=(\d+)-(\d+)/.exec(r.headers.get('Range'));return new Response(ranged?bytes.subarray(+start,+end+1):bytes,{status:ranged?206:200})}}};
 for(const [country,region,city] of [['US','CA','Los Angeles'],['NG','LA','Lagos'],['BJ','LI','Cotonou']]){
  const r=await locations.locationRoute(new Request('https://econect.test/api/locations/cities?country='+country+'&region='+region),env);assert.equal(r.status,200);assert.ok((await r.json()).cities.includes(city));
 }
}
assert.equal((await locations.locationRoute(new Request('https://econect.test/api/locations/regions?country=invalid'),{})).status,400);
const transformed=localizeSource('const x=<><option>Home</option><input placeholder="Search"/><code>Home</code>{page==="Home"}</>;',process.cwd()+'/app/example.tsx',new Set(['Home','Search']));
assert.match(transformed,/value="Home"/);assert.match(transformed,/__econectT\("Search"\)/);assert.match(transformed,/<code>Home<\/code>/);assert.match(transformed,/page==="Home"/);
let saved=null,handler;Object.defineProperty(globalThis,'navigator',{value:{languages:['fr-FR'],language:'fr-FR'},configurable:true});globalThis.localStorage={getItem:()=>saved,setItem:(_,v)=>saved=v};globalThis.document={documentElement:{}};globalThis.window={addEventListener:(_,fn)=>handler=fn};
const i18n=await load(readFileSync('app/i18n.tsx','utf8').replace("import {useEffect,useSyncExternalStore} from 'react';",'const useEffect=()=>{},useSyncExternalStore=()=>{};').replace("import catalog from '../shared/translations.json';",'const catalog='+readFileSync('shared/translations.json','utf8')+';'));
assert.equal(i18n.getLocale(),'fr');assert.notEqual(i18n.t('Home'),'Home');i18n.setLanguage('ar');assert.equal(document.documentElement.dir,'rtl');i18n.setLanguage('auto');navigator.languages=['xx-XX'];handler();assert.equal(i18n.getLocale(),'en');assert.equal(document.documentElement.dir,'ltr');assert.equal(saved,'auto');
console.log('Localization and geography: phone language, RTL, safe JSX values, worldwide regions, country precedence and ranged cities passed.');
