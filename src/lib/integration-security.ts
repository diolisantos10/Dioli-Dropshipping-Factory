import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type IntegrationStatus='DRAFT'|'CONFIGURED'|'TESTED'|'ACTIVE'|'ERROR'|'DISABLED';

function key(){const value=process.env.DDF_CREDENTIALS_KEY;if(!value)throw new Error('DDF_CREDENTIALS_KEY não configurada.');return createHash('sha256').update(value).digest()}
export function encryptIntegrationSecrets(value:Record<string,string>){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64')}
export function decryptIntegrationSecrets(value:string|null){if(!value)return{};const raw=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',key(),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8')) as Record<string,string>}
export function integrationStatusForSecrets(secrets:Record<string,string>):IntegrationStatus{return Object.values(secrets).some(Boolean)?'CONFIGURED':'DRAFT'}
export function serializePublicIntegration(row:Record<string,unknown>){return{id:row.id,kind:row.kind,providerKey:row.provider_key,name:row.name,environment:row.environment,status:row.status,config:row.config??{},secretFields:row.secret_fields??[],capabilities:row.capabilities??[],lastTestedAt:row.last_tested_at,lastError:row.last_error,createdAt:row.created_at,updatedAt:row.updated_at}}
