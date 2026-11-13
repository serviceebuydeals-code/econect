import countries from './geo-countries.json';
export type Country={code:string;name:string;aliases:string[];currency:string;regionCount:number};
export const countryList=countries as Country[];
const fold=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const names=new Map<string,Country>();for(const c of countryList){names.set(c.code.toLowerCase(),c);for(const name of [c.name,...c.aliases])names.set(fold(name),c)}
export function countryFor(value:unknown){if(typeof value!=='string')return null;return names.get(value.trim().toLowerCase())||names.get(fold(value))||null}
export function requestCountry(r:Request){const value=(r as Request&{cf?:{country?:unknown}}).cf?.country;return typeof value==='string'?countryFor(value):null}
export function preferredMarketCountry(r:Request,profileCountry?:string){return requestCountry(r)||countryFor(profileCountry)}
export function countryName(code:string,locale='en'){try{return new Intl.DisplayNames([locale],{type:'region'}).of(code)||countryFor(code)?.name||code}catch{return countryFor(code)?.name||code}}
const regionLabels:Record<string,string>={BJ:'Department',CA:'Province / territory',GH:'Region',FR:'Region',GB:'Region',NG:'State',US:'State',IN:'State / territory'};
export const subdivisionLabel=(code:string)=>regionLabels[code]||'State / region';
