import {Router} from 'express';
import {authenticate} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {many} from '../db/pool.js';
const router=Router();
router.use(authenticate);
router.get('/',asyncHandler(async(_req,res)=>{
 const roles=await many('SELECT code,label,department FROM pb_roles ORDER BY department,label,code');
 res.json({roles});
}));
export default router;
