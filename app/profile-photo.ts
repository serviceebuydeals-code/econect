// Normalize only profile pictures; original files are never modified.
function openPhoto(blob:Blob):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(blob),image=new Image();
  const finish=(error?:Error)=>{clearTimeout(timer);image.onload=null;image.onerror=null;URL.revokeObjectURL(url);error?reject(error):resolve(image)};
  const timer=setTimeout(()=>finish(Error('This photo took too long to open. Please select it again.')),15000);
  image.onload=()=>image.naturalWidth&&image.naturalHeight?finish():finish(Error('This picture has no readable image.'));
  image.onerror=()=>finish(Error('This picture could not be opened. It may be damaged or in an unsupported format.'));
  image.src=url;
 });
}
export async function prepareProfilePhoto(file:File):Promise<File>{
 if(!file.size)throw Error('This picture is empty. Choose another photo.');
 const head=new Uint8Array(await file.slice(0,64).arrayBuffer()),text=new TextDecoder('latin1').decode(head);
 const heic=/image\/hei[cf]/i.test(file.type)||/\.hei[cf]$/i.test(file.name)||(text.slice(4,8)==='ftyp'&&/heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8)));
 const known=/^image\//i.test(file.type)||/\.(jpe?g|jfif|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name)||head[0]===255&&head[1]===216||text.startsWith('\x89PNG')||text.startsWith('GIF8')||text.startsWith('RIFF')&&text.includes('WEBP');
 if(!known&&!heic)throw Error('Choose an image such as JPG, PNG, WebP, GIF, AVIF or HEIC.');
 let image:HTMLImageElement;
 try{image=await openPhoto(file)}catch(error){
  if(!heic)throw error;
  try{
   const {heicTo}=await import('heic-to');
   const converted=await heicTo({blob:file,type:'image/jpeg',quality:.9});
   if(!(converted instanceof Blob))throw Error('Invalid conversion');
   image=await openPhoto(converted);
  }catch{throw Error('This HEIC photo could not be converted. Export it as JPG or choose another picture.')}
 }
 const canvas=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('This device cannot prepare the photo.');
 for(let step=0;step<10;step++){
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const quality=step<3?.88-step*.14:.6;
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(!blob)throw Error('This photo could not be processed. Please choose another picture.');
  if(blob.size<500000)return new File([blob],'profile.jpg',{type:'image/jpeg',lastModified:file.lastModified});
  if(step>=2){canvas.width=Math.max(1,Math.round(canvas.width*.75));canvas.height=Math.max(1,Math.round(canvas.height*.75))}
 }
 throw Error('This photo could not be reduced enough to upload. Please choose another picture.');
}
