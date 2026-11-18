import {ZodError} from 'zod';
import {HttpError} from '../utils/errors.js';
export function asyncHandler(fn){return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}
export function errors(error,_req,res,_next){
 if(res.headersSent)return _next(error);
 const send=(status,code,message,details)=>res.status(status).json({error:message,status,code,...(details?{details}:{})});
 if(error instanceof ZodError)return send(400,'VALIDATION_ERROR','Datos inválidos',error.issues.map(i=>({field:i.path.join('.'),message:i.message})));
 if(error.type==='entity.parse.failed')return send(400,'INVALID_JSON','El cuerpo de la solicitud no contiene JSON válido');
 if(error.type==='entity.too.large'||error.code==='LIMIT_FILE_SIZE')return send(413,'PAYLOAD_TOO_LARGE','El archivo o la solicitud supera el tamaño permitido');
 if(error.code==='ER_DUP_ENTRY')return send(409,'CONFLICT','El registro ya existe');
 if(error.code==='LIMIT_UNEXPECTED_FILE'||error.code==='LIMIT_FILE_COUNT')return send(400,'INVALID_UPLOAD','La solicitud contiene archivos inesperados o demasiados archivos');
 if(error instanceof HttpError)return send(error.status,'HTTP_'+error.status,error.message);
 console.error('[ERROR]',error);
 if(['ECONNREFUSED','ETIMEDOUT','PROTOCOL_CONNECTION_LOST','ER_CON_COUNT_ERROR'].includes(error.code))return send(503,'DEPENDENCY_UNAVAILABLE','Un servicio necesario no está disponible. Inténtalo más tarde.');
 return send(500,'INTERNAL_ERROR','Error interno del servidor');
}
