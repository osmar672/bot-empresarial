import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {pool,one,many,transaction} from './pool.js';
import {env} from '../config/env.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const credentialsDir=path.resolve(__dirname,'../../credentials');

const FIRST_NAMES=[
  'Carlos','María','José','Ana','Juan','Lucía','Diego','Valeria','Andrés','Camila',
  'Gabriel','Elena','Fernando','Natalia','Luis','Daniela','Javier','Mariana','Alejandro','Paula',
  'Esteban','Carolina','Felipe','Adriana','Manuel','Laura','Ricardo','Beatriz','Mauricio','Patricia',
  'Emilio','Gabriela','Roberto','Silvia','Óscar'
];

const LAST_NAMES=[
  'Rodríguez','González','Hernández','Jiménez','Morales','Alvarado','Vargas','Castillo','Castro','Rojas',
  'Salas','Navarro','Campos','Soto','Delgado','Guzmán','Solís','Vega','Chacón','Montero',
  'Brenes','Cordero','Aguilar','Calvo','Mora','Araya','Pérez','López','Gómez','Méndez',
  'Quesada','Valverde','Madrigal','Solano','Herrera'
];

export async function seedCollaborators({targetCompanyName=null,clean=false}={}){
  // 1. Conteo inicial
  const initialColabRow=await one(`SELECT COUNT(*) AS count FROM pb_users WHERE role != 'admin'`);
  const initialTotalRow=await one(`SELECT COUNT(*) AS count FROM pb_users`);
  const initialColabs=Number(initialColabRow?.count||0);
  const initialTotal=Number(initialTotalRow?.count||0);

  // 2. Determinar empresa destino
  let company;
  if(targetCompanyName){
    company=await one('SELECT id, name FROM pb_companies WHERE name = ? OR id = ?',[targetCompanyName,targetCompanyName]);
  }
  if(!company){
    // Preferir Rockstar (empresa de feat-oscar) si existe, o Café Montaña S.A.
    company=await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'") ||
            await one("SELECT id, name FROM pb_companies WHERE name = 'Café Montaña S.A.'") ||
            await one("SELECT id, name FROM pb_companies ORDER BY created_at ASC LIMIT 1");
  }
  if(!company){
    throw new Error('No existe ninguna empresa en la base de datos. Ejecuta primero npm run db:seed');
  }

  const domain=company.name.toLowerCase().replace(/[^a-z0-9]/g,'')||'empresa';
  const prefix=`colab`;

  // 3. Comprobar si ya existen los 500 colaboradores
  const existingSeed=await one(
    `SELECT COUNT(*) AS count FROM pb_users WHERE company_id = ? AND email LIKE ?`,
    [company.id, `${prefix}%@${domain}.cr`]
  );
  const existingCount=Number(existingSeed?.count||0);

  if(existingCount>=500&&!clean){
    console.log(`ℹ Los 500 colaboradores ya están registrados para la empresa "${company.name}".`);
    const finalColabRow=await one(`SELECT COUNT(*) AS count FROM pb_users WHERE role != 'admin'`);
    const finalTotalRow=await one(`SELECT COUNT(*) AS count FROM pb_users`);
    return {
      initialColabs,
      initialTotal,
      added:0,
      existingCount,
      finalColabs:Number(finalColabRow?.count||0),
      finalTotal:Number(finalTotalRow?.count||0),
      company
    };
  }

  // 4. Generar los 500 colaboradores
  const collaborators=[];
  const emailsSet=new Set();
  const deliveryRows=[['numero','nombre','email','password_10_caracteres','rol','empresa']];

  // Distribuir roles no-admin válidos del catálogo
  const allowedRoles=[
    'colaborador','rrhh_analista','finanzas_asistente','tecnologia_analista',
    'operaciones_analista','calidad_analista','compras_auxiliar','colaborador'
  ];

  for(let i=1;i<=500;i++){
    const numStr=String(i).padStart(3,'0');
    const fn=FIRST_NAMES[(i-1)%FIRST_NAMES.length];
    const ln1=LAST_NAMES[Math.floor((i-1)/FIRST_NAMES.length)%LAST_NAMES.length];
    const ln2=LAST_NAMES[(i*7)%LAST_NAMES.length];
    const name=`${fn} ${ln1} ${ln2}`;

    const email=`${prefix}${numStr}@${domain}.cr`;
    assert.ok(!emailsSet.has(email),`Correo duplicado detectado: ${email}`);
    emailsSet.add(email);

    // Contraseña de EXACTAMENTE 10 caracteres
    // "Colab" (5) + numStr (3) + "!x" (2) = 10 caracteres exactos
    const plainPassword=`Colab${numStr}!x`;
    assert.equal(plainPassword.length,10,`La contraseña debe tener exactamente 10 caracteres: ${plainPassword}`);

    const role=allowedRoles[(i-1)%allowedRoles.length];

    collaborators.push({
      id:randomUUID(),
      company_id:company.id,
      name,
      email,
      plainPassword,
      role
    });

    deliveryRows.push([i,name,email,plainPassword,role,company.name]);
  }

  assert.equal(collaborators.length,500,'Deben generarse exactamente 500 colaboradores');
  assert.equal(emailsSet.size,500,'Los 500 correos deben ser únicos');

  // 5. Hashear contraseñas en lotes concurrentes para optimizar tiempo
  console.log('Generando hashes bcrypt (rounds=10) para 500 colaboradores...');
  const batchSize=50;
  for(let b=0;b<collaborators.length;b+=batchSize){
    const slice=collaborators.slice(b,b+batchSize);
    await Promise.all(slice.map(async c=>{
      c.password_hash=await bcrypt.hash(c.plainPassword,10);
    }));
  }

  // 6. Inserción transaccional idempotente en MySQL
  console.log(`Insertando 500 colaboradores en MySQL para la empresa "${company.name}"...`);
  await transaction(async cx=>{
    for(let b=0;b<collaborators.length;b+=batchSize){
      const slice=collaborators.slice(b,b+batchSize);
      const values=slice.map(c=>[
        c.id,
        c.company_id,
        c.name,
        c.email,
        c.password_hash,
        c.role
      ]);

      await cx.query(
        `INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES ? 
         ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), role=VALUES(role)`,
        [values]
      );
    }
  });

  // 7. Guardar archivo de entrega seguro para pruebas (ignorado por git en backend/credentials/)
  await fs.mkdir(credentialsDir,{recursive:true});
  const deliveryPath=path.join(credentialsDir,'colaboradores_500_entrega.csv');
  const csvContent=deliveryRows.map(row=>row.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  await fs.writeFile(deliveryPath,csvContent,'utf8');
  console.log(`✓ Archivo seguro de credenciales generado en: ${deliveryPath}`);

  // 8. Estadísticas finales
  const finalColabRow=await one(`SELECT COUNT(*) AS count FROM pb_users WHERE role != 'admin'`);
  const finalTotalRow=await one(`SELECT COUNT(*) AS count FROM pb_users`);
  const finalColabs=Number(finalColabRow?.count||0);
  const finalTotal=Number(finalTotalRow?.count||0);

  return {
    initialColabs,
    initialTotal,
    added:collaborators.length,
    finalColabs,
    finalTotal,
    company,
    deliveryPath
  };
}

// Ejecución directa por CLI
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const argCompany=process.argv.slice(2).find(a=>!a.startsWith('--'))||null;
  seedCollaborators({targetCompanyName:argCompany})
    .then(res=>{
      console.log('\n=== REPORTE DE CARGA DE 500 COLABORADORES ===');
      console.log(`Empresa: ${res.company.name} (${res.company.id})`);
      console.log(`Colaboradores iniciales en BD: ${res.initialColabs}`);
      console.log(`Colaboradores agregados: ${res.added}`);
      console.log(`Colaboradores finales en BD: ${res.finalColabs}`);
      console.log(`Total usuarios en BD (incluyendo administradores): ${res.finalTotal}`);
      console.log('Todas las contraseñas: exactamente 10 caracteres verificadas.');
      console.log('Todos los correos: únicos y con formato empresarial verificado.');
      process.exit(0);
    })
    .catch(err=>{
      console.error('Error durante la carga:',err);
      process.exit(1);
    });
}
