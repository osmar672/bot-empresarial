import {normalizeFolder} from './drive.js';
import {z} from 'zod';
import {ROLE_CODES} from '../config/roles.js';
const roleCode=z.enum(ROLE_CODES);
export const signupSchema=z.object({companyName:z.string().trim().min(3).max(150),name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(190).transform(x=>x.toLowerCase()),password:z.string().min(10).max(100)}).strict();
export const loginSchema=z.object({email:z.string().trim().email().max(190).transform(x=>x.toLowerCase()),password:z.string().min(1).max(100)}).strict();
export const userSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(190).transform(x=>x.toLowerCase()),password:z.string().min(10).max(100),role:roleCode.default('colaborador')}).strict();
export const messageSchema=z.object({question:z.string().trim().min(2).max(2000),conversationId:z.string().uuid().optional(),documentIds:z.array(z.string().uuid()).min(1).max(30).refine(ids=>new Set(ids).size===ids.length,'No repitas documentos').optional()}).strict();
export const folderSchema=z.object({folderId:z.string().transform(normalizeFolder).pipe(z.union([z.string().regex(/^[A-Za-z0-9_-]{10,120}$/, 'Pega un enlace de carpeta de Google Drive o su ID'),z.literal('')]))}).strict();
export const idSchema=z.string().uuid();

export const documentAccessSchema=z.object({allowedRoles:z.array(roleCode).min(1).max(ROLE_CODES.length).refine(roles=>new Set(roles).size===roles.length,'No repitas roles')}).strict();
export const roleSchema=z.object({role:roleCode}).strict();
