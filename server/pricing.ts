export async function getCoinPrice(db:D1Database):Promise<number>{
 const setting=await db.prepare("SELECT value FROM settings WHERE key='ecoin_price'").first<{value:string}>();
 const value=setting?Number(JSON.parse(setting.value).naira):1500;
 if(!Number.isFinite(value)||value<0.01||value>1e9)throw Error('Invalid eCoin price. Ask the administrator to update pricing.');
 return Math.round(value*100)/100;
}
export const coinAmount=(coins:number,price:number)=>Math.round(coins*price*100)/100;
