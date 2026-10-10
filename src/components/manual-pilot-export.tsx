'use client';

import { useState } from 'react';
import type { Candidate } from '@/lib/intake';
import type { MasterProduct } from '@/lib/product-factory';
import { isEyewearProduct } from '@/lib/product-filters';
import { candidateCard } from '@/lib/storefront';

export function ManualPilotExport({ candidates, products = [] }: { candidates: Candidate[]; products?: MasterProduct[] }) {
  const [message, setMessage] = useState('');
  const candidate = candidates.find(item => item.status !== 'REJEITADO' && item.status !== 'ARQUIVADO'
    && isEyewearProduct(item.category ?? '', item.fullName || item.name)
    && !products.some(product => product.candidateId === item.id && product.archivedAt));

  function download() {
    if (!candidate) return;
    try {
      const card = candidateCard(candidate);
      const supplier = card.sourceDetails;
      const product = products.find(item => item.candidateId === candidate.id && !item.archivedAt);
      const packet = {
        schemaVersion: 1, exportedAt: new Date().toISOString(),
        candidate: { id: candidate.id, name: card.fullTitle, status: candidate.status, category: candidate.category, sourceUrl: candidate.url },
        product: product ? { id: product.id, version: product.version, status: product.status, title: product.universalTitle,
          shortDescription: product.shortDescription, longDescription: product.longDescription, category: product.category,
          bullets: product.bullets, benefits: product.benefits, tags: product.tags, spec: product.spec } : null,
        supplier: supplier ? { name: supplier.name, ref: supplier.ref, cost: supplier.cost, currency: supplier.currency,
          stock: supplier.stock, description: supplier.description, specifications: supplier.specifications,
          dimensions: supplier.dimensions, weightGrams: supplier.weightGrams, packageDimensions: supplier.packageDimensions,
          packageWeightGrams: supplier.packageWeightGrams, materials: supplier.materials, features: supplier.features,
          variants: supplier.variants, facts: supplier.facts, sales: supplier.sales, rating: supplier.rating, reviewCount: supplier.reviewCount } : null,
        sourceImages: [...new Set([...card.images, ...(supplier?.variants ?? []).map(item => item.imageUrl), ...(product?.spec?.sourceImages ?? [])].filter((url): url is string => !!url))],
        instructions: 'Completar apenas dados comprovados nas fontes. Catálogo: no mínimo quatro ângulos distintos, quadrados, hiper-realistas, produto sem pessoas e sem mudar geometria ou variante. Este arquivo não aprova nem publica o produto.',
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `ddf-oculos-teste-${candidate.id}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage(`Ficha de “${card.fullTitle}” baixada. Envie o arquivo no chat para executar o teste manual.`);
    } catch {
      setMessage('Não foi possível baixar a ficha. Tente novamente neste navegador.');
    }
  }

  return <section className="surface space-y-2 p-4" aria-label="Teste manual de um óculos">
    <button type="button" className="ddf-button secondary" disabled={!candidate} onClick={download}>Baixar primeiro óculos para teste</button>
    <p className="text-sm text-[var(--muted)]">{candidate ? 'Baixa a ficha e todos os links das imagens de um óculos desta fila, sem chamada de IA.' : 'Nenhum óculos ativo identificado nesta fila.'}</p>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
