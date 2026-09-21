import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export const runtime = 'nodejs';
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});
const allowed = new Set(['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']);

export async function POST(request:Request){
 const role=request.headers.get('x-ddf-role')||(process.env.NODE_ENV==='production'?'':'ADMIN');
 if(!['ADMIN','APPROVER'].includes(role))return Response.json({error:'Permissão insuficiente.'},{status:403});
 try{
  const form=await request.formData();const file=form.get('file');
  if(!(file instanceof File))return Response.json({error:'Arquivo obrigatório.'},{status:400});
  if(!allowed.has(file.type))return Response.json({error:'Formato não permitido.'},{status:415});
  if(file.size<=0||file.size>10_000_000)return Response.json({error:'Arquivo deve ter até 10 MB.'},{status:413});
  const content=Buffer.from(await file.arrayBuffer());const checksum=createHash('sha256').update(content).digest('hex');const id=randomUUID();
  await pool.query(`INSERT INTO media_blobs(id,filename,mime_type,bytes,checksum_sha256,content) VALUES($1,$2,$3,$4,$5,$6)`,[id,file.name.slice(0,255),file.type,file.size,checksum,content]);
  return Response.json({id,url:`${new URL(request.url).origin}/api/media?id=${id}`,filename:file.name,mimeType:file.type,bytes:file.size,checksum},{status:201});
 }catch{return Response.json({error:'Não foi possível armazenar a mídia.'},{status:503})}
}

export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');
 if(!id||!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:'ID inválido.'},{status:400});
 const result=await pool.query('SELECT filename,mime_type,bytes,checksum_sha256,content FROM media_blobs WHERE id=$1',[id]);
 if(!result.rows[0])return Response.json({error:'Mídia não encontrada.'},{status:404});
 const row=result.rows[0];return new Response(row.content,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.bytes),'ETag':`"${row.checksum_sha256}"`,'Content-Disposition':`inline; filename="${String(row.filename).replace(/["\\]/g,'')}"`,'Cache-Control':'private, max-age=3600'}});
}
