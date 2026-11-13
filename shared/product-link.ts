export function productIdFromLocation(value:{pathname:string;search:string}){const match=/^\/product\/([^/]+)\/?$/.exec(value.pathname);if(match){try{return decodeURIComponent(match[1])}catch{return ''}}return new URLSearchParams(value.search).get('product')||''}
export const productHref=(id:string)=>'/product/'+encodeURIComponent(id);
