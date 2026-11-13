import {readFileSync} from 'node:fs';
export function inlineGeography(code){
 if(!code.includes("from '../shared/geography'"))return code;
 const countries=readFileSync('shared/geo-countries.json','utf8'),index=readFileSync('shared/geo-index.json','utf8');
 const helpers=readFileSync('shared/geography.ts','utf8').replace("import countries from './geo-countries.json';",'const countries='+countries+';').replace(/export /g,'');
 return code.replace(/^import .*from '\.\.\/shared\/geography';\n/m,helpers+'\n').replace("import {hasRegions} from './locations';",'const hasRegions=(code:string)=>!!('+index+')[code]?.regions.length;');
}
