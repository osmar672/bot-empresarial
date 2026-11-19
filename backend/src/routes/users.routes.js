import {audit,notify} from '../services/activity.service.js';
import {queueWelcome,dispatchWelcome} from '../services/mail.service.js';
import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {many,run,transaction,one} from '../db/pool.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {userSchema,roleSchema,idSchema} from '../utils/validation.js';
import {HttpError} from '../utils/errors.js';
const router=Router();router.use(authenticate,adminOnly);
const MAX_COLLABORATORS=500;

router.get('/',asyncHandler(async(req,res)=>{
  const page=Math.max(1,parseInt(req.query.page,10)||1);
  const limit=Math.max(1,Math.min(100,parseInt(req.query.limit,10)||25));
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const role=typeof req.query.role==='string'?req.query.role.trim():'';

  const conditions=['u.company_id=?'];
  const params=[req.companyId];

  if(search){
    conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
    const pattern=`%${search}%`;
    params.push(pattern,pattern);
  }

  if(role){
    conditions.push('u.role=?');
    params.push(role);
  }

  const whereClause=conditions.join(' AND ');
  const countRow=await one(`SELECT COUNT(*) AS total FROM pb_users u WHERE ${whereClause}`,params);
  const total=Number(countRow?.total||0);
  const totalPages=Math.max(1,Math.ceil(total/limit));
  const currentPage=Math.min(page,totalPages);
  const offset=(currentPage-1)*limit;

  const users=await many(
    `SELECT u.id,u.name,u.email,u.role,u.created_at,u.company_id,c.name AS company_name,r.label AS role_label FROM pb_users u JOIN pb_companies c ON c.id=u.company_id JOIN pb_roles r ON r.code=u.role WHERE ${whereClause} ORDER BY u.created_at ASC, u.id ASC LIMIT ? OFFSET ?`,
    [...params,limit,offset]
  );

  // Contador específico de colaboradores (roles no-admin) de la empresa autenticada
  const colabCountRow=await one(
    'SELECT COUNT(*) AS total FROM pb_users WHERE company_id=? AND role != "admin"',
    [req.companyId]
  );
  const companyCollaborators=Number(colabCountRow?.total||0);
  const available=Math.max(0,MAX_COLLABORATORS-companyCollaborators);

  res.json({
    users,
    page:currentPage,
    limit,
    total,
    totalPages,
    company:{
      id:req.companyId,
      name:req.user.company_name,
      collaborators:companyCollaborators,
      capacity:MAX_COLLABORATORS,
      available
    }
  });
}));

router.post('/',asyncHandler(async(req,res)=>{
  const data=userSchema.parse(req.body);
  const hash=await bcrypt.hash(data.password,12);
  const id=randomUUID();
  let mailId;

  await transaction(async cx=>{
    // Concurrencia segura: bloqueo de fila a nivel de empresa
    await cx.execute('SELECT id FROM pb_companies WHERE id=? FOR UPDATE',[req.companyId]);

    // Control de límite de colaboradores (los roles distintos de admin cuentan hacia la capacidad)
    if(data.role!=='admin'){
      const [colabRows]=await cx.execute(
        'SELECT COUNT(*) AS total FROM pb_users WHERE company_id=? AND role != "admin"',
        [req.companyId]
      );
      const currentColabs=Number(colabRows[0]?.total||0);
      if(currentColabs>=MAX_COLLABORATORS){
        throw new HttpError(403,`Se ha alcanzado la capacidad máxima de colaboradores (${MAX_COLLABORATORS}) para esta empresa.`);
      }
    }

    // Comprobar unicidad de correo electrónico
    const [existing]=await cx.execute('SELECT id FROM pb_users WHERE email=?',[data.email]);
    if(existing.length){
      throw new HttpError(409,'El correo electrónico ya se encuentra registrado');
    }

    await cx.execute(
      'INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)',
      [id,req.companyId,data.name,data.email,hash,data.role]
    );

    mailId=await queueWelcome(cx,{id,companyId:req.companyId,email:data.email,name:data.name});
  });

  const welcomeEmail=await dispatchWelcome(mailId);
  res.status(201).json({welcomeEmail,user:{id,name:data.name,email:data.email,role:data.role}});
}));

router.patch('/:id/role',asyncHandler(async(req,res)=>{
 const id=idSchema.parse(req.params.id),{role}=roleSchema.parse(req.body);
 await transaction(async cx=>{
  await cx.execute('SELECT id FROM pb_companies WHERE id=? FOR UPDATE',[req.companyId]);
  const [users]=await cx.execute('SELECT id,role FROM pb_users WHERE company_id=? AND id=? FOR UPDATE',[req.companyId,id]);
  if(!users.length)throw new HttpError(404,'Usuario no encontrado');
  if(id===req.user.id&&role!=='admin')throw new HttpError(409,'No puedes quitarte tu propio rol de administrador');

  // Si pasa de admin a colaborador, verificar límite de capacidad
  if(users[0].role==='admin'&&role!=='admin'){
    const [colabRows]=await cx.execute(
      'SELECT COUNT(*) AS total FROM pb_users WHERE company_id=? AND role != "admin"',
      [req.companyId]
    );
    const currentColabs=Number(colabRows[0]?.total||0);
    if(currentColabs>=MAX_COLLABORATORS){
      throw new HttpError(403,`Se ha alcanzado la capacidad máxima de colaboradores (${MAX_COLLABORATORS}) para esta empresa.`);
    }
  }

  await cx.execute('UPDATE pb_users SET role=? WHERE id=? AND company_id=?',[role,id,req.companyId]);
  await audit({companyId:req.companyId,actorId:req.user.id,action:'users.role_changed',targetType:'user',targetId:id,detail:{from:users[0].role,to:role}},cx);
  await notify({companyId:req.companyId,userId:id,kind:'security',title:'Tu rol fue actualizado',body:'Administración actualizó tu rol de acceso.',target:'profile'},cx);
 });res.json({ok:true});
}));
export default router;
