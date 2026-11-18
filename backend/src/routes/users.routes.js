import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {many,run,transaction,one} from '../db/pool.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {userSchema,roleSchema,idSchema} from '../utils/validation.js';
import {HttpError} from '../utils/errors.js';
const router=Router();router.use(authenticate,adminOnly);
router.get('/',asyncHandler(async(req,res)=>{
  const page=Math.max(1,parseInt(req.query.page,10)||1);
  const limit=Math.max(1,Math.min(100,parseInt(req.query.limit,10)||25));
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const role=typeof req.query.role==='string'?req.query.role.trim():'';

  const conditions=['company_id=?'];
  const params=[req.companyId];

  if(search){
    conditions.push('(name LIKE ? OR email LIKE ?)');
    const pattern=`%${search}%`;
    params.push(pattern,pattern);
  }

  if(role){
    conditions.push('role=?');
    params.push(role);
  }

  const whereClause=conditions.join(' AND ');
  const countRow=await one(`SELECT COUNT(*) AS total FROM pb_users WHERE ${whereClause}`,params);
  const total=Number(countRow?.total||0);
  const totalPages=Math.max(1,Math.ceil(total/limit));
  const currentPage=Math.min(page,totalPages);
  const offset=(currentPage-1)*limit;

  const users=await many(
    `SELECT id,name,email,role,created_at FROM pb_users WHERE ${whereClause} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    [...params,limit,offset]
  );

  res.json({
    users,
    page:currentPage,
    limit,
    total,
    totalPages
  });
}));
router.post('/',asyncHandler(async(req,res)=>{
  const data=userSchema.parse(req.body),hash=await bcrypt.hash(data.password,12),id=randomUUID();
  await run('INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)',[id,req.companyId,data.name,data.email,hash,data.role]);
  res.status(201).json({user:{id,name:data.name,email:data.email,role:data.role}});
}));
router.patch('/:id/role',asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id),{role}=roleSchema.parse(req.body);
 await transaction(async cx=>{
  await cx.execute('SELECT id FROM pb_companies WHERE id=? FOR UPDATE',[req.companyId]);
  const [users]=await cx.execute('SELECT id,role FROM pb_users WHERE company_id=? AND id=? FOR UPDATE',[req.companyId,id]);
  if(!users.length)throw new HttpError(404,'Usuario no encontrado');
  if(id===req.user.id&&role!=='admin')throw new HttpError(409,'No puedes quitarte tu propio rol de administrador');
  await cx.execute('UPDATE pb_users SET role=? WHERE id=? AND company_id=?',[role,id,req.companyId]);
 });res.json({ok:true});
}));
export default router;
