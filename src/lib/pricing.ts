export type PricingInput = { productId: string; supplierCost: number; shipping: number; taxes: number; fixedFees: number; channelFeePercent: number; paymentFeePercent: number; operatingCost: number; reserve: number; targetMarginPercent: number; minimumMarginPercent: number; currency: string; country?:string; channel?:string; store?:string; offerId?:string; fxRate?:number };
export type PriceCalculation = PricingInput & { id: string; version: number; totalFixedCost: number; variableRate: number; suggestedPrice: number | null; minimumSafePrice: number | null; status: 'CALCULADO'|'BLOQUEADO'|'QUARENTENA'; reason: string; at: string; approval:'PENDENTE'|'APROVADO'; approvedAt?:string; approvedBy?:string };
export type PricingState = { version: 1; calculations: PriceCalculation[] };
export const PRICING_STORAGE_KEY = 'ddf.pricing.demo.v1'; export const emptyPricing: PricingState = { version: 1, calculations: [] };
const money = (v: number) => Math.round(v * 100) / 100;
export function calculatePrice(state: PricingState, input: PricingInput, id: string, at: string): PricingState {
  const values = Object.entries(input).filter(([,v]) => typeof v === 'number').map(([,v]) => v as number);
  if (values.some(v => !Number.isFinite(v) || v < 0) || !input.currency.trim()) throw new Error('Preencha todos os componentes com valores válidos.');
  const fxRate=input.fxRate??1;if(!Number.isFinite(fxRate)||fxRate<=0)throw new Error('Taxa de câmbio inválida.');
  const totalFixedCost = money((input.supplierCost + input.shipping) * fxRate + input.taxes + input.fixedFees + input.operatingCost + input.reserve);
  const variableRate = (input.channelFeePercent + input.paymentFeePercent) / 100;
  const target = input.targetMarginPercent / 100; const minimum = input.minimumMarginPercent / 100;
  let status: PriceCalculation['status'] = 'CALCULADO'; let reason = '';
  if (totalFixedCost <= 0) { status = 'BLOQUEADO'; reason = 'Custo real ausente.'; }
  if (target < minimum) { status = 'BLOQUEADO'; reason = 'Margem alvo abaixo da margem mínima.'; }
  if (variableRate + target >= 1 || variableRate + minimum >= 1) { status = 'BLOQUEADO'; reason = 'Taxas e margem tornam o cálculo inviável.'; }
  const suggestedPrice = status === 'CALCULADO' ? money(totalFixedCost / (1 - variableRate - target)) : null;
  const minimumSafePrice = status === 'CALCULADO' ? money(totalFixedCost / (1 - variableRate - minimum)) : null;
  const context=(calculation:PriceCalculation)=>`${calculation.country??''}|${calculation.channel??''}|${calculation.store??''}|${calculation.offerId??''}|${calculation.currency}`;
  const draft={...input} as PriceCalculation;const previous=state.calculations.find(c=>c.productId===input.productId&&context(c)===context(draft));
  if(status==='CALCULADO'&&previous?.suggestedPrice&&suggestedPrice&&Math.abs(suggestedPrice-previous.suggestedPrice)/previous.suggestedPrice>0.3){status='QUARENTENA';reason='Variação superior a 30% exige análise de impacto.'}
  const version = (previous?.version ?? 0) + 1;
  return { ...state, calculations: [{ ...input, id, version, totalFixedCost, variableRate, suggestedPrice, minimumSafePrice, status, reason, at,approval:'PENDENTE' }, ...state.calculations] };
}
export function approvePrice(state:PricingState,id:string,actor:string,at:string):PricingState{const calculation=state.calculations.find(item=>item.id===id);if(!calculation||calculation.status!=='CALCULADO')throw new Error('Somente cálculo seguro pode ser aprovado.');if(!actor.trim())throw new Error('Aprovador obrigatório.');return{...state,calculations:state.calculations.map(item=>item.id===id?{...item,approval:'APROVADO',approvedAt:at,approvedBy:actor}:item)}}
