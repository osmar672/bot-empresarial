import {many} from '../db/pool.js';
import {cosine} from './localEmbedding.js';
import {embed,embeddingModel} from '../services/embedding.service.js';
export async function rankChunks(companyId,question,{db=many,embedding=embed,model=embeddingModel(),limit=5,threshold,role='colaborador',documentIds=null}={}){
  let sql=`SELECT c.id,c.content,c.embedding,d.id AS document_id,d.name AS document_name,d.drive_url
    FROM pb_chunks c JOIN pb_documents d ON d.id=c.document_id AND d.company_id=c.company_id
    WHERE c.company_id=? AND d.company_id=? AND d.state='indexado' AND c.embedding_model=? AND (?='admin' OR JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(?)))`;
  const params=[companyId,companyId,model,role,role];
  if(documentIds?.length){sql+=' AND d.id IN ('+documentIds.map(()=>'?').join(',')+')';params.push(...documentIds);}
  const [queryVector]=await embedding([question],'query');
  const cutoff=threshold??(model.startsWith('local-')?0.075:0.17);
  let best=[],offset=0;
  do{
    const chunks=await db(sql+' ORDER BY c.id LIMIT 500 OFFSET '+offset,params);
    best=[...best,...chunks.map(c=>({...c,score:cosine(queryVector,typeof c.embedding==='string'?JSON.parse(c.embedding):c.embedding)})).filter(c=>Number.isFinite(c.score)&&c.score>=cutoff)].sort((a,b)=>b.score-a.score).slice(0,limit);
    if(db!==many||chunks.length<500)break;offset+=500;
  }while(true);
  return best.map(({embedding,...c},index)=>({...c,ref:index+1}));
}
