export type BrandBrief = {
  key: 'dilly' | 'santioh'; name: string; version: number; enabled: boolean;
  positioning: string; audience: string; categories: string[]; criteria: string[];
  exclusions: string[]; queries: string[]; dailyLimit: number; basis: string;
};
const basis = 'Briefing inicial baseado nas diretrizes confirmadas em conversa. Brand book ainda não recebido nesta execução.';
export const initialBrandBriefs: BrandBrief[] = [
  { key: 'santioh', name: 'Santioh', version: 1, enabled: true,
    positioning: 'Óculos de design diferenciado, sofisticação moderna e acessível. Variedade de estilos e preços; identidade sóbria em preto, branco e cinza.',
    audience: 'Público amplo, diferentes estilos pessoais e referências culturais.', categories: ['Óculos de sol', 'Armações'],
    criteria: ['Design diferenciado', 'Detalhes e materiais documentados', 'Variedade de formatos e estilos', 'Fotos suficientes para analisar o produto', 'Possibilidade de opções acessíveis; preço final depende do Pricing'],
    exclusions: ['Falsificações', 'Logotipos de terceiros copiados', 'Alegações de proteção UV sem comprovação do fornecedor'],
    queries: ['geometric sunglasses', 'retro oval sunglasses', 'minimalist metal sunglasses', 'acetate sunglasses'], dailyLimit: 10, basis },
  { key: 'dilly', name: 'Dilly', version: 1, enabled: true,
    positioning: 'Roupas e acessórios masculinos e femininos, modernos, elegantes e acessíveis. Minimalismo com personalidade e curadoria de moda contemporânea.',
    audience: 'Homens e mulheres que procuram moda atual, design e preço acessível.', categories: ['Roupas femininas', 'Roupas masculinas', 'Acessórios'],
    criteria: ['Design contemporâneo', 'Modelagem e tabela de medidas documentadas', 'Material e composição informados', 'Detalhes diferenciados', 'Variações de tamanho e cor claras'],
    exclusions: ['Falsificações', 'Logotipos de terceiros copiados', 'Uso de marcas de referência como identidade do produto'],
    queries: ['minimalist women tailored blazer', 'modern men knit shirt', 'women architectural shoulder bag', 'men tailored trousers'], dailyLimit: 10, basis },
];
export function validateBrandBrief(value: BrandBrief): BrandBrief {
  if (!['dilly', 'santioh'].includes(value.key)) throw new Error('Marca inválida.');
  if (typeof value.enabled !== 'boolean') throw new Error('Situação do briefing inválida.');
  if (!Number.isInteger(value.dailyLimit) || value.dailyLimit < 1 || value.dailyLimit > 30) throw new Error('Limite diário deve estar entre 1 e 30.');
  for (const field of ['positioning', 'audience', 'basis'] as const) if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 4000) throw new Error(`Campo inválido: ${field}.`);
  for (const field of ['categories', 'criteria', 'exclusions', 'queries'] as const) {
    if (!Array.isArray(value[field]) || !value[field].length || value[field].length > 12 || value[field].some(item => typeof item !== 'string' || !item.trim() || item.length > (field === 'queries' ? 120 : 500))) throw new Error(`Lista inválida: ${field}.`);
  }
  return { ...value, queries: [...new Set(value.queries.map(query => query.trim()))] };
}
export function discoveryQuery(brief: BrandBrief, cursor: number) { return brief.queries[Math.abs(Math.trunc(cursor)) % brief.queries.length]; }
export function discoveryEvidence(brief: BrandBrief, query: string) { return ['discovery:auto', `brand:${brief.key}`, `brief-version:${brief.version}`, `search-query:${query}`, 'engine:aliexpress-api-rules']; }
export function dayInBrazil(at = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
// Text screening protects raw intake from explicit replicas; original branded products are not
// assumed counterfeit merely because a familiar brand appears. Uncertain candidates stay raw.
export function excludedDiscoveryTitle(title: string) { return /\b(replica|counterfeit|fake brand|1:1 copy|copy logo)\b/i.test(title); }
export function parseDiscoveryShortlist(text: string, allowedIds: string[], limit: number): string[] {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(clean) as { itemIds?: unknown };
  if (!Array.isArray(parsed.itemIds) || parsed.itemIds.some(id => typeof id !== 'string' || !allowedIds.includes(id))) throw new Error('A curadoria retornou referências fora dos resultados do fornecedor.');
  const ids = [...new Set(parsed.itemIds as string[])];
  if (ids.length > limit) throw new Error('A curadoria excedeu o limite de produtos.');
  return ids;
}
