import {ShoppingBag} from 'lucide-react';
import './chat-content.css';
export function ProductChatMessage({body,open}:{body:string,open:(id:string)=>void}){let p:any;try{p=JSON.parse(body)}catch{return <p>Product preview unavailable.</p>}return <div className="chat-product"><span>PRODUCT REQUEST</span>{p.image&&<img src={p.image} alt={p.name} loading="lazy"/>}<strong>{p.name}</strong><b>₦{Number(p.price||0).toLocaleString()}</b><small>{p.location}</small><button className="secondary" onClick={()=>open(p.id)}><ShoppingBag size={14}/> View product</button></div>}
