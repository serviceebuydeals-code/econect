import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),{Country,State,City}=require('country-state-city');
const root=process.cwd(),out=resolve(root,'public/geo');mkdirSync(out,{recursive:true});mkdirSync(resolve(root,'shared'),{recursive:true});
const aliasExtra={US:['United States','United States of America','USA'],GB:['United Kingdom','UK','Great Britain'],CI:['Ivory Coast',"Côte d’Ivoire","Côte d'Ivoire","Cote D'Ivoire"],CD:['DR Congo','Democratic Republic of the Congo','Congo - Kinshasa'],CG:['Congo - Brazzaville','Republic of the Congo'],KR:['South Korea'],KP:['North Korea'],TR:['Turkey','Türkiye'],PS:['Palestine','Palestinian Territories'],VA:['Vatican City'],VN:['Vietnam','Viet Nam'],LA:['Laos'],RU:['Russia','Russian Federation'],TZ:['Tanzania'],BN:['Brunei'],IR:['Iran'],MD:['Moldova'],TW:['Taiwan'],HK:['Hong Kong'],MO:['Macao','Macau'],SZ:['Eswatini','Swaziland'],MM:['Myanmar','Myanmar (Burma)']};
const grouped=new Map();for(const city of City.getAllCities()){const key=city.countryCode+'/'+(city.stateCode||'');if(!grouped.has(key))grouped.set(key,new Set());grouped.get(key).add(city.name)}
const overlay={'NG/LA':['Lagos','Ikeja','Lekki','Ikorodu','Badagry','Epe','Festac Town','Amuwo Odofin'],'BJ/LI':['Cotonou'],'BJ/OU':['Porto-Novo']};for(const [key,names] of Object.entries(overlay)){if(!grouped.has(key))grouped.set(key,new Set());for(const n of names)grouped.get(key).add(n)}
const countries=Country.getAllCountries().map(c=>({code:c.isoCode,name:c.name,aliases:[...new Set([c.name,new Intl.DisplayNames(['en'],{type:'region'}).of(c.isoCode),...(aliasExtra[c.isoCode]||[])])],currency:c.currency,regionCount:State.getStatesOfCountry(c.isoCode).length})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
let offset=0;const chunks=[],index={};function range(key){const names=[...(grouped.get(key)||[])].sort((a,b)=>a.localeCompare(b,'en')),data=Buffer.from(JSON.stringify(names)+'\n');const entry={offset,length:data.length,count:names.length};chunks.push(data);offset+=data.length;return entry}
for(const c of countries){index[c.code]={regions:State.getStatesOfCountry(c.code).map(s=>({code:s.isoCode,name:s.name,...range(c.code+'/'+s.isoCode)})).sort((a,b)=>a.name.localeCompare(b.name,'en')),unassigned:range(c.code+'/')}}
writeFileSync(resolve(out,'cities.dat'),Buffer.concat(chunks));
writeFileSync(resolve(root,'shared/geo-countries.json'),JSON.stringify(countries));
writeFileSync(resolve(root,'shared/geo-index.json'),JSON.stringify(index));
writeFileSync(resolve(out,'countries.json'),JSON.stringify(countries));
const packageRoot=dirname(require.resolve('country-state-city/package.json'));
writeFileSync(resolve(out,'LICENSE.txt'),'Geographic data derived from country-state-city 3.2.1, distributed under GPL-3.0.\nSource: https://github.com/harpreetkhalsagtbit/country-state-city/tree/v3.2.1\nPackage source: https://www.npmjs.com/package/country-state-city/v/3.2.1\nThis location dataset and its generated indexes are available from this site. Regenerate with scripts/build-geography.mjs.\n\n'+readFileSync(resolve(packageRoot,'LICENSE'),'utf8'));
console.log('Generated geography: '+countries.length+' countries, '+Object.values(index).reduce((n,c)=>n+c.regions.length,0)+' regions, '+grouped.size+' city groups; '+offset+' bytes served as ranged static assets.');
