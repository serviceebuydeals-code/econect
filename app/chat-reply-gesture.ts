export function createReplyGesture(reply:()=>void,timers:{set:(fn:()=>void,ms:number)=>any;clear:(id:any)=>void}={set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)}){
 let start:{x:number;y:number}|null=null,timer:any=null,suppress=false;
 const cancel=()=>{if(timer!==null)timers.clear(timer);timer=null;start=null};
 const select=()=>{suppress=true;cancel();reply()};
 return{start(x:number,y:number){cancel();suppress=false;start={x,y};timer=timers.set(select,500)},move(x:number,y:number){if(start&&(Math.abs(x-start.x)>12||Math.abs(y-start.y)>12)){if(timer!==null)timers.clear(timer);timer=null}},end(x:number,y:number){const point=start;cancel();if(point&&x-point.x < -55&&Math.abs(y-point.y)<35)select()},cancel,context(){if(!suppress)select()},consumeClick(){const value=suppress;suppress=false;return value}};
}
