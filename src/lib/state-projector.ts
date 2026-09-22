import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import type { StateNamespace } from './server-state';

type JsonRecord = Record<string, unknown>;
const records = (value: unknown, key: string): JsonRecord[] => {
  if (!value || typeof value !== 'object') return [];
  const list = (value as JsonRecord)[key];
  return Array.isArray(list) ? list.filter((item): item is JsonRecord => !!item && typeof item === 'object') : [];
};
const text = (row: JsonRecord, key: string, fallback = '') => typeof row[key] === 'string' ? row[key] as string : fallback;
const number = (row: JsonRecord, key: string, fallback = 0) => typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] as number : fallback;
const date = (row: JsonRecord, key: string) => text(row, key, new Date().toISOString());
const stableUuid = (value: string) => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
};

export async function projectState(client: PoolClient, namespace: StateNamespace, payload: unknown, actor: string) {
  if (namespace === 'intake') {
    for (const row of records(payload, 'candidates')) await client.query(`INSERT INTO raw_candidates
      (id,source,source_url,normalized_url,name,notes,region,category_hint,evidence,status,created_at,updated_at)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,notes=EXCLUDED.notes,region=EXCLUDED.region,category_hint=EXCLUDED.category_hint,evidence=EXCLUDED.evidence,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
      [text(row,'id'),text(row,'source','MANUAL'),text(row,'url'),text(row,'name'),text(row,'notes'),text(row,'region')||null,text(row,'category')||null,JSON.stringify(row.evidence??[]),text(row,'status','CANDIDATO'),date(row,'createdAt')]);
    for (const row of records(payload, 'events')) await client.query(`INSERT INTO triage_decisions
      (id,candidate_id,before_status,after_status,reason,actor,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO NOTHING`,[stableUuid(text(row,'id')),text(row,'candidateId'),row.before??null,text(row,'after'),text(row,'reason'),text(row,'actor',actor),date(row,'at')]);
  }
  if (namespace === 'products') {
    for (const row of records(payload, 'products')) {
      await client.query(`INSERT INTO master_products
        (id,candidate_id,status,version,universal_title,short_description,long_description,seo,compliance,localization,created_at,updated_at)
        VALUES($1,(SELECT id FROM raw_candidates WHERE id=$2),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,version=EXCLUDED.version,universal_title=EXCLUDED.universal_title,
        short_description=EXCLUDED.short_description,long_description=EXCLUDED.long_description,seo=EXCLUDED.seo,
        compliance=EXCLUDED.compliance,localization=EXCLUDED.localization,updated_at=EXCLUDED.updated_at`,[
        text(row,'id'),text(row,'candidateId')||null,text(row,'status','EM_PRODUCAO'),number(row,'version',1),text(row,'universalTitle'),
        text(row,'shortDescription'),text(row,'longDescription'),JSON.stringify(row.seo??{}),JSON.stringify(row.compliance??{}),
        JSON.stringify(row.localization??{}),date(row,'createdAt'),date(row,'updatedAt')]);
      await client.query(`INSERT INTO product_versions(product_id,version,snapshot,actor,created_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,version) DO NOTHING`,
        [text(row,'id'),number(row,'version',1),JSON.stringify(row),actor,date(row,'updatedAt')]);
    }
  }
  if (namespace === 'media') for (const row of records(payload,'assets')) if (text(row,'checksum')) await client.query(`INSERT INTO media_assets
    (id,product_id,kind,status,storage_key,checksum,mime_type,bytes,purpose,provenance)
    VALUES($1,(SELECT id FROM master_products WHERE id=$2),$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,purpose=EXCLUDED.purpose,provenance=EXCLUDED.provenance`,[
    text(row,'id'),text(row,'productId'),text(row,'kind','ORIGINAL'),text(row,'status','EM_REVISAO'),text(row,'url'),text(row,'checksum'),text(row,'mimeType','application/octet-stream'),number(row,'bytes'),text(row,'purpose'),text(row,'provenance')]);
  if (namespace === 'pricing') for (const row of records(payload, 'calculations')) await client.query(`INSERT INTO price_calculations
    (id,product_id,context,version,currency,components,suggested_price,minimum_safe_price,status,reason,calculated_at)
    VALUES($1,(SELECT id FROM master_products WHERE id=$2),$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,[
    text(row,'id'),text(row,'productId'),JSON.stringify({country:row.country??'BR',channel:row.channel??null,store:row.store??null}),
    number(row,'version',1),text(row,'currency','BRL'),JSON.stringify(row),row.suggestedPrice??null,row.minimumSafePrice??null,
    text(row,'status','BLOQUEADO'),text(row,'reason')||null,date(row,'at')]);
  if (namespace === 'orders') for (const row of records(payload, 'orders')) await client.query(`INSERT INTO orders
    (id,external_order_id,status,currency,economic_snapshot,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,economic_snapshot=EXCLUDED.economic_snapshot,updated_at=EXCLUDED.updated_at`,[
    text(row,'id'),text(row,'externalOrderId'),text(row,'status','RECEBIDO'),text(row,'currency','BRL'),
    JSON.stringify({salePrice:row.salePrice,costSnapshot:row.costSnapshot,productId:row.productId,tracking:row.tracking}),date(row,'createdAt'),date(row,'updatedAt')]);
}
