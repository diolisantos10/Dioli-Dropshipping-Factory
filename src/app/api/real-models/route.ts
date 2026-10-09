import { randomUUID } from 'node:crypto';
import { getDatabasePool } from '@/lib/server-state';
import { forbidden, hasRole, requestActor } from '@/lib/request-context';
import { validateRealModel } from '@/lib/real-models';
export const runtime='nodejs';
export async function GET(request:Request) {
  if (!hasRole(request,['ADMIN','APPROVER','OPERATOR','VIEWER'])) return forbidden();
  try {const db=await getDatabasePool();return Response.json({models:(await db.query('SELECT id,name,brand,measurements,photos,notes,revision FROM real_models ORDER BY name')).rows});}
  catch {return Response.json({error:'Catálogo de modelos indisponível.'},{status:503});}
}
export async function POST(request:Request) {
  if (!hasRole(request,['ADMIN','APPROVER'])) return forbidden();
  let model;
  try {model=validateRealModel(await request.json(),new URL(request.url).origin);} catch(error) {return Response.json({error:error instanceof Error?error.message:'Cadastro inválido.'},{status:400});}
  const db=await getDatabasePool();const client=await db.connect();
  try {
    await client.query('BEGIN');
    // Every reference must be a stored, authenticated image, never an external replacement.
    for(const photo of model.photos){const id=new URL(photo.url).searchParams.get('id');const stored=(await client.query('SELECT checksum_sha256,mime_type,bytes FROM media_blobs WHERE id=$1',[id])).rows[0];if(!stored||stored.checksum_sha256!==photo.checksum||stored.mime_type!==photo.mimeType||Number(stored.bytes)!==photo.bytes)throw new Error('Foto não encontrada no arquivo de mídia.');}
    const params=[model.id,model.name,model.brand,JSON.stringify(model.measurements),JSON.stringify(model.photos),model.notes];
    const result=model.revision===0?await client.query('INSERT INTO real_models(id,name,brand,measurements,photos,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *',params):await client.query('UPDATE real_models SET name=$2,brand=$3,measurements=$4,photos=$5,notes=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$7 RETURNING *',[...params,model.revision]);
    if(!result.rows.length){await client.query('ROLLBACK');return Response.json({error:'O cadastro mudou. Recarregue antes de salvar.'},{status:409});}
    await client.query(`INSERT INTO audit_events(id,actor,action,entity_type,entity_id,correlation_id,metadata) VALUES($1,$2,'MODEL_PROFILE_SAVED','REAL_MODEL',$3,$4,$5)`,[randomUUID(),requestActor(request),model.id,randomUUID(),JSON.stringify({revision:result.rows[0].revision,photoCount:model.photos.length})]);
    await client.query('COMMIT');return Response.json({model:result.rows[0]});
  }catch{await client.query('ROLLBACK');return Response.json({error:'Não foi possível salvar o modelo e suas referências.'},{status:503});}finally{client.release();}
}
