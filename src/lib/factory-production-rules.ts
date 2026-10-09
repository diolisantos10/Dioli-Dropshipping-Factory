import type { Candidate } from './intake.ts';
import type { MasterProduct } from './product-factory.ts';

export function productionCandidates(candidates: Candidate[], products: MasterProduct[]) {
  return candidates.filter(candidate => candidate.status === 'APROVADO' && !products.some(product => product.candidateId === candidate.id && product.status === 'PRONTO'));
}

export function parseCommercialCopy(text: string) {
  const raw = JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')) as Record<string, unknown>;
  const field = (key: string, max: number) => {
    if (typeof raw[key] !== 'string' || !(raw[key] as string).trim() || (raw[key] as string).length > max) throw new Error(`Conteúdo comercial inválido: ${key}.`);
    return (raw[key] as string).trim();
  };
  const list = (key: string) => {
    const value = raw[key] ?? [];
    if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || item.length > 500)) throw new Error(`Conteúdo comercial inválido: ${key}.`);
    return value as string[];
  };
  // Technical fields are deliberately absent. An LLM cannot supply an unverified measurement.
  return { universalTitle: field('title', 300), shortDescription: field('shortDescription', 1000), longDescription: field('longDescription', 20000), bullets: list('bullets'), benefits: list('benefits'), tags: list('tags') };
}
