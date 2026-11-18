import fs from 'node:fs/promises';
import {env,assertConfig} from '../config/env.js';
import {pool} from './pool.js';
try{
 assertConfig();
 await pool.query(await fs.readFile(new URL('../../../database/migrations/007_profile_photos.sql',import.meta.url),'utf8'));
 console.log('Tabla de fotos de perfil preparada en '+env.db.database+'.');
}catch(error){console.error('No se pudo preparar la tabla de fotos:',error.message);process.exitCode=1;}
finally{await pool.end();}
