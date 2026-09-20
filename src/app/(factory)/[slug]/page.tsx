import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";

type ModuleDefinition = {
  title: string;
  eyebrow: string;
  description: string;
  principle: string;
  steps: string[];
  deferred?: boolean;
};

const modules: Record<string, ModuleDefinition> = {
  "prateleira-bruta": {
    title: "Prateleira Bruta",
    eyebrow: "Intake / oportunidades",
    description: "O estoque barato de oportunidades vindas de sinais de mercado ou entrada manual — sem iniciar produção premium.",
    principle: "Registrar primeiro. Gastar somente depois da aprovação.",
    steps: ["Entrada manual auditável", "Evidências e snapshots", "Busca, filtros e duplicidade", "Envio controlado para triagem"],
  },
  triagem: {
    title: "Sala de Triagem",
    eyebrow: "Portfolio gate / aprovação",
    description: "O portão humano que separa uma possibilidade barata de um produto que merece investimento da fábrica.",
    principle: "Nenhum processamento premium sem sua aprovação explícita.",
    steps: ["Fila de candidatos", "Comparação de evidências", "Decisão e justificativa", "Snapshot completo da aprovação"],
  },
  "product-factory": {
    title: "Product Factory",
    eyebrow: "Produção / cadastro universal",
    description: "Onde candidatos aprovados se transformam em ativos comerciais ricos, reutilizáveis e independentes de fornecedor ou canal.",
    principle: "Master Product e Supplier Offer são entidades independentes.",
    steps: ["Normalização", "Taxonomia e variantes", "Conteúdo comercial", "QA e completude por destino"],
  },
  "media-factory": {
    title: "Media Factory",
    eyebrow: "Produção / ativos comerciais",
    description: "Imagens e vídeos comerciais com origem, versão, custo, finalidade e aprovação claramente rastreáveis.",
    principle: "Melhorar a venda sem descaracterizar o produto.",
    steps: ["Mídia de origem", "Tratamentos e formatos", "Variantes de campanha", "Revisão e aprovação"],
  },
  disponiveis: {
    title: "Produtos Disponíveis",
    eyebrow: "Catálogo / produtos prontos",
    description: "A prateleira central dos produtos completos e aptos a receber estratégia de preço e distribuição.",
    principle: "Produto pronto pode existir sem ser publicado.",
    steps: ["Qualidade e completude", "Ofertas disponíveis", "Mídia aprovada", "Destinos elegíveis"],
  },
  pricing: {
    title: "Pricing & Margem",
    eyebrow: "Economia / proteção",
    description: "Um motor explicável para custo real, preço, margem e guardrails antes de qualquer distribuição.",
    principle: "A DDF pode deixar de vender; não pode vender sem conhecer a margem.",
    steps: ["Componentes de custo", "Regras versionadas", "Simulação por contexto", "Margin Guard"],
  },
  pedidos: {
    title: "Pedidos & Tracking",
    eyebrow: "Operação / ciclo da venda",
    description: "O ciclo bidirecional de pedidos, fornecedor, fulfillment, envio, tracking e exceções.",
    principle: "Toda venda precisa ser rastreável ponta a ponta.",
    steps: ["Pedido normalizado", "Snapshot econômico", "Fulfillment", "Tracking e exceções"],
    deferred: true,
  },
  inteligencia: {
    title: "Intelligence Room",
    eyebrow: "Dados / decisão",
    description: "A camada analítica que separa faturamento de rentabilidade e devolve aprendizado para as decisões da fábrica.",
    principle: "Ausência de dados nunca será mascarada como zero.",
    steps: ["Métricas reconciliáveis", "Dimensões comerciais", "Termômetro de produtos", "Feedback para triagem"],
  },
  integracoes: {
    title: "Connector Hubs",
    eyebrow: "Sistema / fronteiras externas",
    description: "Adaptadores substituíveis para fornecedores, canais e serviços externos, preservando o núcleo da DDF.",
    principle: "A forma da fábrica vem antes dos personagens.",
    steps: ["Contratos universais", "Capabilities", "Idempotência", "Saúde e dados stale"],
    deferred: true,
  },
  auditoria: {
    title: "Auditoria & Eventos",
    eyebrow: "Sistema / rastreabilidade",
    description: "A trilha de decisões, eventos, alterações e falhas que torna a operação explicável e recuperável.",
    principle: "Logs técnicos não substituem a auditoria de negócio.",
    steps: ["Quem, quando e por quê", "Antes e depois", "Correlation IDs", "Retry e fila de exceções"],
  },
};

export function generateStaticParams() {
  return Object.keys(modules).filter(slug => !['prateleira-bruta', 'triagem', 'auditoria', 'product-factory', 'media-factory', 'disponiveis', 'pricing', 'inteligencia'].includes(slug)).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: modules[slug]?.title ?? "Módulo" };
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const moduleDefinition = modules[slug];
  if (!moduleDefinition) notFound();

  return (
    <div className="space-y-9">
      <section className="border-b border-[#ddd9d1] pb-9">
        <p className="eyebrow">{moduleDefinition.eyebrow}</p>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="display-title">{moduleDefinition.title}</h1>
            <p className="lede">{moduleDefinition.description}</p>
          </div>
          <span className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-bold ${moduleDefinition.deferred ? "border-[#d7d2ca] bg-[#ece8e1] text-[#696d75]" : "border-[#f4c5b5] bg-[#ffe5dc] text-[#a83513]"}`}>
            {moduleDefinition.deferred ? <LockKeyhole size={15} /> : <CircleDashed size={15} />}
            {moduleDefinition.deferred ? "Fase posterior" : "Em construção"}
          </span>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="surface p-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#747880]">Fluxo previsto</p>
          <div className="mt-6 grid gap-px overflow-hidden border border-[#ddd9d1] bg-[#ddd9d1] sm:grid-cols-2">
            {moduleDefinition.steps.map((step, index) => (
              <div key={step} className="flex min-h-28 items-start gap-4 bg-[#fbfaf7] p-5">
                <span className="font-mono text-xs font-bold text-[#ff5b2e]">0{index + 1}</span>
                <div>
                  <p className="text-sm font-semibold">{step}</p>
                  <p className="mt-2 text-xs leading-5 text-[#777b83]">Contrato funcional mapeado. Interface e comportamento serão validados nesta fase.</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="space-y-4">
          <div className="surface border-l-4 border-l-[#ff5b2e] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a8e96]">Princípio de projeto</p>
            <p className="mt-3 text-base font-semibold leading-6 tracking-[-0.02em]">{moduleDefinition.principle}</p>
          </div>
          <div className="surface p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-[#157347]" />
              <p className="text-sm font-semibold">Blueprint incorporado</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#777b83]">A interface desta área será construída sobre os critérios oficiais de aceite da DDF.</p>
            <Link href="/visao-geral" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#d83f12] hover:underline">
              Voltar à visão geral <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
