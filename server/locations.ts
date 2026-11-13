import regions from '../shared/geo-index.json';
import {countryFor,countryList,requestCountry} from '../shared/geography';
const index=regions as Record<string,{regions:{code:string;name:string;offset:number;length:number;count:number}[];unassigned:{offset:number;length:number;count:number}}>;
export async function locationRoute(r:Request,env:Cloudflare.Env){
 if(r.method!=='GET')return new Response('Method not allowed',{status:405});
 const url=new URL(r.url),path=url.pathname.slice('/api/locations/'.length);
 if(path==='countries')return Response.json({countries:countryList,detectedCountry:requestCountry(r)});
 const country=countryFor(url.searchParams.get('country'));if(!country)return Response.json({error:'Choose a valid country.'},{status:400});
 const entry=index[country.code];if(path==='regions')return Response.json({country,regions:entry?.regions||[]});
 if(path==='cities'){
  const state=url.searchParams.get('region')||'',range=state?entry?.regions.find(s=>s.code===state):entry?.unassigned;
  if(!range)return Response.json({cities:[]});
  try{const response=await env.ASSETS.fetch(new Request(new URL('/geo/cities.dat',url.origin),{headers:{Range:'bytes='+range.offset+'-'+(range.offset+range.length-1)}}));
   if(!response.ok)return Response.json({cities:[]},{status:503});
   const bytes=new Uint8Array(await response.arrayBuffer()),part=response.status===206?bytes:bytes.slice(range.offset,range.offset+range.length);
   const cities=JSON.parse(new TextDecoder().decode(part));if(!Array.isArray(cities)||!cities.every(v=>typeof v==='string'))throw Error('Invalid location data');
   return Response.json({cities});
  }catch{return Response.json({cities:[],error:'Location suggestions are unavailable. You can type your city.'},{status:503})}
 }
 return new Response('Not found',{status:404});
}
export function hasRegions(code:string){return !!index[code]?.regions.length}
