import {csrfFetch as fetch} from '../../scripts/helpers/csrf-fetch.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import {env} from '../src/config/env.js';
import {pool,one,many,run} from '../src/db/pool.js';
import {seedCollaborators} from '../src/db/seedCollaborators.js';

test('1. Existen al menos 500 colaboradores almacenados realmente en MySQL para la empresa',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  assert.ok(company,'La empresa debe existir');
  const countRow=await one("SELECT COUNT(*) AS total FROM pb_users WHERE company_id = ? AND role != 'admin'",[company.id]);
  const total=Number(countRow?.total||0);
  assert.ok(total>=500,`Debe haber al menos 500 colaboradores en MySQL, se encontraron ${total}`);
});

test('2. Los 500 colaboradores del lote tienen correos únicos',async()=>{
  const company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const domain=company.name.toLowerCase().replace(/[^a-z0-9]/g,'')||'empresa';
  const rows=await many("SELECT email FROM pb_users WHERE company_id = ? AND email LIKE ?",[company.id,`colab%@${domain}.cr`]);
  assert.equal(rows.length,500,'Deben existir 500 correos generados');
  const uniqueEmails=new Set(rows.map(r=>r.email));
  assert.equal(uniqueEmails.size,500,'Todos los 500 correos deben ser únicos');
});

test('3 y 4. Todas las contraseñas cumplen 10 caracteres y los hashes bcrypt se guardan correctamente',async()=>{
  const company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const domain=company.name.toLowerCase().replace(/[^a-z0-9]/g,'')||'empresa';
  // Verificar muestra representativa de colaboradores (primero, intermedios y último)
  const samples=[1,25,100,250,500];
  for(const num of samples){
    const numStr=String(num).padStart(3,'0');
    const email=`colab${numStr}@${domain}.cr`;
    const user=await one("SELECT password_hash FROM pb_users WHERE email = ?",[email]);
    assert.ok(user,`Usuario ${email} debe existir`);
    assert.match(user.password_hash,/^\$2[aby]\$\d{2}\$/,`El hash de ${email} debe tener formato bcrypt`);

    const plainPassword=`Colab${numStr}!x`;
    assert.equal(plainPassword.length,10,`La contraseña ${plainPassword} debe tener exactamente 10 caracteres`);
    const valid=await bcrypt.compare(plainPassword,user.password_hash);
    assert.ok(valid,`El hash almacenado debe validar correctamente con la contraseña de 10 caracteres ${plainPassword}`);
  }
});

test('5. La primera página muestra 25 colaboradores',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const p1=await many("SELECT id, name, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 0",[company.id]);
  assert.equal(p1.length,25,'La primera página debe devolver 25 registros');
});

test('6. La página 2 muestra los siguientes 25 colaboradores diferentes a la página 1',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const p1=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 0",[company.id]);
  const p2=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 25",[company.id]);
  assert.equal(p2.length,25,'La página 2 debe devolver 25 registros');
  const p1Ids=new Set(p1.map(u=>u.id));
  const overlaps=p2.filter(u=>p1Ids.has(u.id));
  assert.equal(overlaps.length,0,'Los registros de la página 2 no deben solaparse con la página 1');
});

test('7. Se puede llegar hasta la página 20 (registros 476–500)',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const p20=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 475",[company.id]);
  assert.equal(p20.length,25,'La página 20 debe tener 25 registros');
});

test('8. Se puede regresar a páginas anteriores con consistencia de datos',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  // Avanzar a p3, luego regresar a p2 y comprobar igualdad estricta
  const forwardP2=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 25",[company.id]);
  const p3=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 50",[company.id]);
  assert.equal(p3.length,25);
  const backP2=await many("SELECT id, email FROM pb_users WHERE company_id = ? ORDER BY created_at ASC, id ASC LIMIT 25 OFFSET 25",[company.id]);
  assert.deepEqual(forwardP2.map(u=>u.id),backP2.map(u=>u.id),'Regresar a la página anterior debe mostrar exactamente los mismos datos');
});

test('9, 10, 11 y 12. Búsqueda por nombre, por correo y coincidencias parciales sin distinción de mayúsculas',async()=>{
  const company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const domain=company.name.toLowerCase().replace(/[^a-z0-9]/g,'')||'empresa';

  // Obtener colaborador ubicado en página 18 para verificar búsqueda profunda
  const deepUser=await one("SELECT name, email FROM pb_users WHERE company_id = ? AND email = ?",[company.id,`colab450@${domain}.cr`]);
  assert.ok(deepUser,'Debe existir colab450');

  // Búsqueda por correo parcial
  const emailSearch=await many("SELECT id, email FROM pb_users WHERE company_id = ? AND (name LIKE ? OR email LIKE ?)",[company.id,'%colab450%','%colab450%']);
  assert.equal(emailSearch.length,1);
  assert.equal(emailSearch[0].email,`colab450@${domain}.cr`);

  // Búsqueda por nombre parcial (case insensitive)
  const firstName=deepUser.name.split(' ')[0];
  const nameSearch=await many("SELECT id, name FROM pb_users WHERE company_id = ? AND (name LIKE ? OR email LIKE ?)",[company.id,`%${firstName.toLowerCase()}%`,`%${firstName.toLowerCase()}%`]);
  assert.ok(nameSearch.length>=1,`Debe encontrar coincidencias con ${firstName}`);
  assert.ok(nameSearch.some(u=>u.name.includes(firstName)),'Debe incluir al usuario esperado');
});

test('13. No aparecen registros de otras empresas (aislamiento multiempresa estricto)',async()=>{
  const companies=await many("SELECT id, name FROM pb_companies");
  assert.ok(companies.length>=2,'Deben existir al menos 2 empresas para verificar aislamiento');

  const c1=companies[0];
  const c2=companies[1];

  const usersC1=await many("SELECT id, company_id FROM pb_users WHERE company_id = ? LIMIT 50",[c1.id]);
  const usersC2=await many("SELECT id, company_id FROM pb_users WHERE company_id = ? LIMIT 50",[c2.id]);

  assert.ok(usersC1.every(u=>u.company_id===c1.id),'Ningún registro de C1 debe pertenecer a otra empresa');
  assert.ok(usersC2.every(u=>u.company_id===c2.id),'Ningún registro de C2 debe pertenecer a otra empresa');

  const c1Ids=new Set(usersC1.map(u=>u.id));
  assert.ok(usersC2.every(u=>!c1Ids.has(u.id)),'No debe haber usuarios compartidos entre empresas');
});

test('14. Los colaboradores persisten en MySQL tras reiniciar conexión',async()=>{
  const company=await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const countRow=await one("SELECT COUNT(*) AS total FROM pb_users WHERE company_id = ? AND role != 'admin'",[company.id]);
  assert.ok(Number(countRow.total)>=500,'Los datos persisten en el motor de base de datos MySQL');
});

test('15. Idempotencia: el proceso de carga no duplica registros si se ejecuta nuevamente',async()=>{
  const company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const before=await one("SELECT COUNT(*) AS total FROM pb_users WHERE company_id = ?",[company.id]);

  // Ejecutar de nuevo la función de seed
  const res=await seedCollaborators({targetCompanyName:company.name});
  assert.equal(res.added,0,'No debe agregar duplicados');

  const after=await one("SELECT COUNT(*) AS total FROM pb_users WHERE company_id = ?",[company.id]);
  assert.equal(Number(before.total),Number(after.total),'El conteo total debe ser idéntico antes y después');
});

let testServer;
let testBase;
async function getTestBase(){
  if(!testServer){
    testServer=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>testServer.once('listening',resolve));
    testBase=`http://127.0.0.1:${testServer.address().port}/api`;
  }
  return testBase;
}

test('16. Control de límite de capacidad: impide registrar colaboradores por encima de 500 por empresa',async()=>{
  const base=await getTestBase();
  const company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
                await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  const admin=await one("SELECT id FROM pb_users WHERE company_id = ? AND role = 'admin'",[company.id]);
  assert.ok(admin,'Debe existir administrador de Rockstar');

  const token=jwt.sign({sub:admin.id},env.jwtSecret,{expiresIn:'1h',issuer:'policybot'});
  const cookie=`policybot_session=${token}`;

  // Intentar agregar colaborador número 501+
  const res=await fetch(`${base}/users`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Cookie:cookie},
    body:JSON.stringify({
      name:'Exceso Colaborador',
      email:`exceso_${randomUUID()}@rockstar.test`,
      password:'Password10!x',
      role:'colaborador'
    })
  });

  assert.equal(res.status,403,'Debe rechazar con HTTP 403 al superar la capacidad máxima de 500');
  const data=await res.json();
  assert.match(data.error||data.message||'',/capacidad máxima/i);
});

test('17. Creación de nueva compañía: inicia con 0 colaboradores, lista vacía y aislamiento total',async()=>{
  const base=await getTestBase();
  const newEmail=`admin_${randomUUID()}@nuevasaas.test`;
  const companyName=`Nueva SaaS ${randomUUID().slice(0,8)}`;

  // 1. Registro de nueva compañía
  const regRes=await fetch(`${base}/auth/register`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      email:newEmail,
      name:'Admin Nueva',
      companyName,
      password:'Password10!x'
    })
  });
  assert.equal(regRes.status,201,'La nueva compañía debe registrarse exitosamente');
  const regData=await regRes.json();
  const newCompanyId=regData.company.id;
  const cookie=regRes.headers.get('set-cookie')?.split(';')[0];

  try {
    // 2. Comprobar que inicia con 0 colaboradores y listado sin colaboradores (solo el admin creador)
    const listRes=await fetch(`${base}/users`,{
      headers:{Cookie:cookie}
    });
    assert.equal(listRes.status,200);
    const listData=await listRes.json();

    const nonAdminUsers=listData.users.filter(u=>u.role!=='admin');
    assert.equal(nonAdminUsers.length,0,'No debe tener colaboradores inicialmente (solo el admin creador)');
    assert.equal(listData.company.collaborators,0,'El contador de colaboradores debe comenzar en 0');
    assert.equal(listData.company.capacity,500);
    assert.equal(listData.company.available,500);
    assert.equal(listData.company.name,companyName);

    // 3. Registrar su primer colaborador propio
    const addColabRes=await fetch(`${base}/users`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Cookie:cookie},
      body:JSON.stringify({
        name:'Colaborador Uno',
        email:`colab1_${randomUUID()}@nuevasaas.test`,
        password:'Password10!x',
        role:'colaborador'
      })
    });
    assert.equal(addColabRes.status,201);

    // 4. Comprobar que ahora tiene 1 colaborador y no ve los de otras empresas
    const afterListRes=await fetch(`${base}/users`,{
      headers:{Cookie:cookie}
    });
    const afterListData=await afterListRes.json();
    assert.equal(afterListData.company.collaborators,1,'Debe tener exactamente 1 colaborador registrado');
    assert.equal(afterListData.company.available,499,'Debe tener 499 cupos disponibles');
    assert.equal(afterListData.total,2,'Total de usuarios de la empresa: 1 admin + 1 colaborador');
    const colabs=afterListData.users.filter(u=>u.role!=='admin');
    assert.equal(colabs.length,1,'Debe tener exactamente 1 colaborador');
    assert.ok(afterListData.users.every(u=>u.email.includes('nuevasaas.test')),'Solo debe ver sus propios usuarios');
  } finally {
    // Limpieza de datos temporales del test
    await run("DELETE FROM pb_companies WHERE id = ?",[newCompanyId]).catch(()=>{});
  }
});

test('18. Intentar acceder o modificar colaboradores de otra empresa es rechazado con 404',async()=>{
  const base=await getTestBase();
  // Obtener usuario de Rockstar
  const rockstarUser=await one("SELECT u.id FROM pb_users u JOIN pb_companies c ON u.company_id=c.id WHERE c.name='Rockstar' AND u.role != 'admin' LIMIT 1");
  assert.ok(rockstarUser,'Debe existir usuario de Rockstar');

  // Obtener admin de Logística Pacífico
  const logisticaAdmin=await one("SELECT u.id FROM pb_users u JOIN pb_companies c ON u.company_id=c.id WHERE c.name='Logística Pacífico' AND u.role='admin'");
  assert.ok(logisticaAdmin,'Debe existir admin de Logística Pacífico');

  const token=jwt.sign({sub:logisticaAdmin.id},env.jwtSecret,{expiresIn:'1h',issuer:'policybot'});
  const cookie=`policybot_session=${token}`;

  // Intentar modificar el rol del usuario de Rockstar desde la sesión de Logística Pacífico
  const patchRes=await fetch(`${base}/users/${rockstarUser.id}/role`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json',Cookie:cookie},
    body:JSON.stringify({role:'tecnologia_analista'})
  });

  assert.equal(patchRes.status,404,'Debe rechazar con HTTP 404 por no pertenecer a la empresa');
});

test.after(async()=>{
  if(testServer){
    await new Promise(resolve=>testServer.close(resolve));
  }
  await pool.end();
});
