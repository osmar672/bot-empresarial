import mammoth from 'mammoth';
import {extractPdf} from './pdfOcr.service.js';
import {HttpError} from '../utils/errors.js';
export const ACCEPTED=['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv'];
export async function extractFile(buffer,mime,options={}){
  if(!Buffer.isBuffer(buffer)||!buffer.length)throw new HttpError(400,'Archivo vacío');
  let text='';
  if(mime==='application/pdf'){
    if(buffer.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'El archivo no parece ser un PDF');
    text=await extractPdf(buffer,options);
  }else if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    if(buffer.subarray(0,2).toString()!=='PK')throw new HttpError(400,'Archivo Word inválido');
    text=(await mammoth.extractRawText({buffer})).value;
  }else if(['text/plain','text/markdown','text/csv'].includes(mime)){
    text=buffer.toString('utf8').replace(/^\uFEFF/,'');
    if(text.includes('\u0000'))throw new HttpError(400,'Archivo de texto inválido');
  }else throw new HttpError(415,'Formato no soportado. Usa PDF, DOCX, TXT, MD o CSV');
  text=String(text||'').trim();
  if(text.length<20)throw new HttpError(422,'No se encontró texto legible suficiente, incluso después del reconocimiento OCR');

  return text;
}
