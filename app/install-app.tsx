import {useEffect,useRef,useState} from 'react';
import {Download,Share,PlusSquare,Smartphone} from 'lucide-react';
import './install-app.css';

type InstallPrompt=Event&{
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
};

export function useAppInstall(){
  const prompt=useRef<InstallPrompt|null>(null);
  const [installed,setInstalled]=useState(()=>isAppWindow());
  const [installing,setInstalling]=useState(false);
  useEffect(()=>{
    const display=window.matchMedia('(display-mode: standalone)');
    const update=()=>setInstalled(isAppWindow());
    const capture=(event:Event)=>{event.preventDefault();prompt.current=event as InstallPrompt};
    const complete=()=>{prompt.current=null;setInstalled(true)};
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',complete);
    display.addEventListener('change',update);
    return()=>{
      window.removeEventListener('beforeinstallprompt',capture);
      window.removeEventListener('appinstalled',complete);
      display.removeEventListener('change',update);
    };
  },[]);
  async function install(showInstructions:()=>void){
    if(installing||installed)return;
    const event=prompt.current;
    if(!event){showInstructions();return}
    // Each browser event can be used only once. Invoke it directly from the tap.
    prompt.current=null;
    setInstalling(true);
    try{
      await event.prompt();
      const choice=await event.userChoice;
      if(choice.outcome==='accepted')setInstalled(true);
    }catch{showInstructions()}
    finally{setInstalling(false)}
  }
  return {installed,installing,install};
}

function isAppWindow(){
  return window.matchMedia('(display-mode: standalone)').matches
    ||window.matchMedia('(display-mode: fullscreen)').matches
    ||!!(navigator as Navigator&{standalone?:boolean}).standalone
    ||/eConectPlayPreview\//i.test(navigator.userAgent);
}

export function InstallCard({onInstall,busy}:{onInstall:()=>void,busy:boolean}){
  return <section className="install-app-card card" aria-label="Install eConect">
    <img src="/icon-192.png" width="44" height="44" alt=""/>
    <div><h3>Take eConect with you</h3><p>Add eConect to your phone’s Home Screen.</p></div>
    <button className="primary" onClick={onInstall} disabled={busy}><Download size={17}/>{busy?'Installing…':'Install app'}</button>
  </section>;
}

export function InstallInstructions({onClose}:{onClose:()=>void}){
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(navigator.userAgent);
  return <div className="install-instructions">
    <img src="/icon-192.png" width="64" height="64" alt="eConect"/>
    <h2>Add eConect to your Home Screen</h2>
    {ios?<><p>Open this website in Safari, then follow these steps:</p><ol>
      <li><Share size={20}/><span>Tap <strong>Share</strong> in Safari’s toolbar or menu.</span></li>
      <li><PlusSquare size={20}/><span>Scroll down and tap <strong>Add to Home Screen</strong>.</span></li>
      <li><Smartphone size={20}/><span>Keep the name <strong>eConect</strong>, turn on <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.</span></li>
    </ol></>:android?<><p>Open this website in Chrome on your phone.</p><ol>
      <li><span>Tap the <strong>three-dot menu ⋮</strong> at the top right.</span></li>
      <li><span>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</span></li>
    </ol><p>If eConect is already installed, open it from your Home Screen or app drawer.</p></>:<><p>On your phone, open <strong>econectapp.com</strong> in Chrome on Android or Safari on iPhone.</p><p>On this computer, look for <strong>Install eConect</strong> in your browser’s address bar or menu.</p></>}
    <button className="primary full" onClick={onClose}>Got it</button>
  </div>;
}
