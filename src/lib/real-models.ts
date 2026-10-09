export const modelMeasureLabels = {heightCm:'Altura (cm)',weightKg:'Peso (kg)',chestCm:'Tórax / busto (cm)',waistCm:'Cintura (cm)',hipsCm:'Quadril (cm)',shouldersCm:'Ombros (cm)',inseamCm:'Entrepernas (cm)',armCm:'Braço (cm)',neckCm:'Pescoço (cm)',thighCm:'Coxa (cm)',wristCm:'Pulso (cm)',handLengthCm:'Comprimento da mão (cm)',handWidthCm:'Largura da mão (cm)'};
export type ModelMeasure = keyof typeof modelMeasureLabels;
export type ModelPhoto = {url:string;angle:string;framing?:'ROSTO'|'CINTURA'|'CORPO_INTEIRO'|'DETALHE'|'MAOS'|'OUTRO';checksum:string;mimeType:string;bytes:number};
export type RealModel = {id:string;name:string;brand:string;measurements:Partial<Record<ModelMeasure,number|null>>;photos:ModelPhoto[];notes:string;revision:number};
export function validateRealModel(input: unknown, origin: string): RealModel {
  if (!input || typeof input !== 'object') throw new Error('Cadastro inválido.');
  const raw=input as RealModel;
  if (!/^[a-f0-9-]{36}$/i.test(raw.id) || !Number.isInteger(raw.revision) || raw.revision<0) throw new Error('Identificação inválida.');
  if (typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>160||typeof raw.brand!=='string'||!raw.brand.trim()||raw.brand.length>120) throw new Error('Informe nome e marca.');
  const measurements: RealModel['measurements']={};
  for (const key of Object.keys(modelMeasureLabels) as ModelMeasure[]) {
    const value=raw.measurements?.[key];
    if (value===undefined||value===null) {measurements[key]=null;continue;}
    if (typeof value!=='number'||!Number.isFinite(value)||value<=0||value>500) throw new Error(`Medida inválida: ${modelMeasureLabels[key]}.`);
    measurements[key]=value;
  }
  if (!Array.isArray(raw.photos)||raw.photos.length>40) throw new Error('Até 40 fotos por modelo.');
  const photos=raw.photos.map(photo=>{
    const url=new URL(photo.url);
    if (url.origin!==origin||url.pathname!=='/api/media'||!/^[a-f0-9-]{36}$/i.test(url.searchParams.get('id')??'')||!['image/jpeg','image/png','image/webp','image/avif'].includes(photo.mimeType)||typeof photo.angle!=='string'||!photo.angle.trim()||photo.angle.length>160||!/^\w{64}$/.test(photo.checksum)||!Number.isInteger(photo.bytes)||photo.bytes<=0||photo.bytes>10_000_000) throw new Error('Foto de referência inválida. Faça upload da foto original.');
    if (photo.framing && !['ROSTO','CINTURA','CORPO_INTEIRO','DETALHE','MAOS','OUTRO'].includes(photo.framing)) throw new Error('Enquadramento inválido.');
    return {url:url.href,angle:photo.angle.trim(),...(photo.framing?{framing:photo.framing}:{}),checksum:photo.checksum,mimeType:photo.mimeType,bytes:photo.bytes};
  });
  return {id:raw.id,name:raw.name.trim(),brand:raw.brand.trim(),measurements,photos,notes:typeof raw.notes==='string'?raw.notes.slice(0,6000):'',revision:raw.revision};
}
