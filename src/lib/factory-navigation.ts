import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  FileClock,
  Gauge,
  Images,
  Map,
  PackageCheck,
  PackageOpen,
  PlugZap,
  ShoppingBag,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  phase: "agora" | "depois";
  description: string;
  keywords: string[];
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Comando",
    items: [
      { href: "/visao-geral", label: "Visão geral", shortLabel: "Visão", icon: Gauge, phase: "agora", description: "Resumo da operação, indicadores, filas e alertas da fábrica.", keywords: ["dashboard", "indicadores", "resumo", "alertas"] },
      { href: "/briefings", label: "Briefings das marcas", shortLabel: "Briefings", icon: BrainCircuit, phase: "agora", description: "Diretrizes, consultas e limites da busca automática para Dilly e Santioh.", keywords: ["marca", "briefing", "busca", "dilly", "santioh"] },
      { href: "/mapa-factory", label: "Mapa da Factory", shortLabel: "Mapa", icon: Map, phase: "agora", description: "Guia visual do fluxo e da função de cada área da Factory.", keywords: ["ajuda", "fluxo", "seções", "como funciona"] },
      { href: "/prateleira-bruta", label: "Prateleira Bruta", shortLabel: "Entrada", icon: PackageOpen, phase: "agora", description: "Entrada de ideias e produtos candidatos antes da avaliação.", keywords: ["produto", "candidato", "entrada", "importar"] },
      { href: "/triagem", label: "Sala de Triagem", shortLabel: "Triagem", icon: ClipboardCheck, phase: "agora", description: "Reserva produtos pré-selecionados até a decisão manual de produzir.", keywords: ["aprovar", "rejeitar", "avaliar", "candidato"] },
    ],
  },
  {
    label: "Produção",
    items: [
      { href: "/product-factory", label: "Product Factory", shortLabel: "Produto", icon: Factory, phase: "agora", description: "Transforma aprovados em produtos mestres, variantes e conteúdo comercial.", keywords: ["cadastro", "produto mestre", "variantes", "seo"] },
      { href: "/media-factory", label: "Media Factory", shortLabel: "Mídia", icon: Images, phase: "agora", description: "Preserva originais e prepara pelo menos quatro fotos de estúdio fiéis ao produto.", keywords: ["imagem", "vídeo", "direitos", "criativos"] },
      { href: "/disponiveis", label: "Produtos Disponíveis", shortLabel: "Prontos", icon: PackageCheck, phase: "agora", description: "Fim da esteira: produtos completos aguardam sua seleção manual de loja.", keywords: ["catálogo", "prontos", "oferta", "publicar"] },
      { href: "/modelos", label: "Modelos reais", shortLabel: "Modelos", icon: Images, phase: "agora", description: "Pastas com fotos neutras e medidas dos modelos de vestuário.", keywords: ["modelo", "roupa", "medidas", "dive"] },
      { href: "/pricing", label: "Pricing & Margem", shortLabel: "Margem", icon: CircleDollarSign, phase: "agora", description: "Após escolher a loja, calcula custos, taxas, preço e margem do destino.", keywords: ["preço", "custos", "lucro", "taxas"] },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/pedidos", label: "Pedidos & Tracking", shortLabel: "Pedidos", icon: ShoppingBag, phase: "depois", description: "Acompanha pedidos, fulfillment, rastreio e exceções de entrega.", keywords: ["pedido", "tracking", "rastreio", "entrega"] },
      { href: "/inteligencia", label: "Intelligence Room", shortLabel: "Dados", icon: BrainCircuit, phase: "agora", description: "Consolida desempenho, tendências, receita, custo e aprendizados.", keywords: ["análise", "performance", "dados", "receita"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/integracoes", label: "Connector Hubs", shortLabel: "Conexões", icon: PlugZap, phase: "depois", description: "Configura credenciais e sincronização com fornecedores, canais e serviços.", keywords: ["integração", "api", "chave", "aliexpress", "conector"] },
      { href: "/auditoria", label: "Auditoria & Eventos", shortLabel: "Auditoria", icon: FileClock, phase: "agora", description: "Registra mudanças, eventos, erros, tentativas e responsáveis.", keywords: ["log", "evento", "erro", "histórico"] },
    ],
  },
];

export const flatNavigation = navigationGroups.flatMap((group) => group.items);
