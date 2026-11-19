import sharp from 'sharp';
import {one} from '../db/pool.js';
import {HttpError} from '../utils/errors.js';
export async function photoUrl(userId,companyId){
 try{
  const row=await one('SELECT version FROM pb_user_photos WHERE user_id=? AND company_id=?',[userId,companyId]);
  return row?'/api/profile/photo?v='+row.version:null;
 }catch(error){if(error.code==='ER_NO_SUCH_TABLE')return null;throw error;}
}
export async function normalizePhoto(buffer,{cover=false}={}){
 try{
  const image=sharp(buffer,{limitInputPixels:20000000,animated:false,failOn:'warning'});
  const meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw new Error('Formato no admitido');
  // Decode and re-encode: strip metadata and never serve the uploaded bytes directly.
  const scale=Math.min(1,1600/meta.width,500/meta.height);
  const size=Math.min(512,meta.width,meta.height);
  return await image.rotate().resize(cover?Math.max(1,Math.round(1600*scale)):size,cover?Math.max(1,Math.round(500*scale)):size,{fit:'cover',position:'attention'}).webp({quality:85}).toBuffer();
 }catch{throw new HttpError(400,'La foto no es válida. Elige una imagen JPG, PNG o WebP de hasta 20 megapíxeles.');}
}
