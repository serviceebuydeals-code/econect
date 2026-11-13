import {useEffect,useSyncExternalStore} from 'react';
import catalog from '../shared/translations.json';
export const languages={en:'English',fr:'Français',es:'Español',pt:'Português',de:'Deutsch',ar:'العربية',hi:'हिन्दी',zh:'中文',sw:'Kiswahili'};
type Language=keyof typeof languages;
const dictionary=catalog as Record<string,Record<string,string>>;
const listeners=new Set<()=>void>();let preference='auto';
try{preference=localStorage.getItem('econect-language')||'auto'}catch{}
export function resolveLanguage(values:readonly string[]){for(const value of values){const base=value.toLowerCase().split('-')[0];if(base in languages)return base as Language}return 'en' as Language}
export function phoneLanguages(){return typeof navigator==='undefined'?['en']:navigator.languages?.length?[...navigator.languages]:[navigator.language||'en']}
export function getLocale(){return preference!=='auto'&&preference in languages?preference as Language:resolveLanguage(phoneLanguages())}
export function t(key:string,values:Record<string,string|number>={}){return (dictionary[key]?.[getLocale()]||key).replace(/\{(\w+)\}/g,(whole,name)=>name in values?String(values[name]):whole)}
export function setLanguage(value:string){preference=value==='auto'||value in languages?value:'auto';try{localStorage.setItem('econect-language',preference)}catch{}applyLanguage();for(const listener of listeners)listener()}
function applyLanguage(){if(typeof document==='undefined')return;document.documentElement.lang=getLocale();document.documentElement.dir=getLocale()==='ar'?'rtl':'ltr'}
if(typeof window!=='undefined'){applyLanguage();window.addEventListener('languagechange',()=>{applyLanguage();for(const listener of listeners)listener()})}
export function useLocale(){return useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback)}},getLocale,()=> 'en' as Language)}
export function LanguageControls(){
 useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback)}},()=>preference+'|'+phoneLanguages().join(','),()=> 'auto|en');
 const locale=useLocale();useEffect(applyLanguage,[locale]);const device=phoneLanguages()[0];let phone=device;try{phone=new Intl.DisplayNames([device],{type:'language'}).of(device)||device}catch{}
 return <div className="locale-strip"><span>{t('Phone language')}: <b lang={device}>{phone}</b></span><label><span>{t('Language')}</span><select aria-label={t('Language')} value={preference} onChange={e=>setLanguage(e.target.value)}><option value="auto">{t('Automatic')} · {languages[resolveLanguage(phoneLanguages())]}</option>{Object.entries(languages).map(([code,name])=><option key={code} value={code} lang={code}>{name}</option>)}</select></label>{!phoneLanguages().some(v=>v.toLowerCase().split('-')[0] in languages)&&preference==='auto'&&<small>{t('English fallback')}</small>}</div>;
}
