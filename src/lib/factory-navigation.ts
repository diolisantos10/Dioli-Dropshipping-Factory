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
      { href: "/mapa-factory", label: "Mapa da Factory", shortLabel: "Mapa", icon: Map, phase: "agora", description: "Guia visual do fluxo e da função de cada área da Factory.", keywords: ["ajuda", "fluxo", "seções", "como funciona"] },
      { href: "/prateleira-bruta", label: "Prateleira Bruta", shortLabel: "Entrada", icon: PackageOpen, phase: "agora", description: "Entrada de ideias e produtos candidatos antes da avaliação.", keywords: ["produto", "candidato", "entrada", "importar"] },
      { href: "/triagem", label: "Sala de Triagem", shortLabel: "Triagem", icon: ClipboardCheck, phase: "agora", description: "Avalia, compara, aprova ou rejeita os produtos candidatos.", keywords: ["aprovar", "rejeitar", "avaliar", "candidato"] },
    ],
  },
  {
    label: "Produção",
    items: [
      { href: "/product-factory", label: "Product Factory", shortLabel: "Produto", icon: Factory, phase: "agora", description: "Transforma aprovados em produtos mestres, variantes e conteúdo comercial.", keywords: ["cadastro", "produto mestre", "variantes", "seo"] },
      { href: "/media-factory", label: "Media Factory", shortLabel: "Mídia", icon: Images, phase: "agora", description: "Organiza originais, direitos, versões e transformações de mídia.", keywords: ["imagem", "vídeo", "direitos", "criativos"] },
      { href: "/disponiveis", label: "Produtos Disponíveis", shortLabel: "Prontos", icon: PackageCheck, phase: "agora", description: "Catálogo dos produtos prontos para oferta, canal ou campanha.", keywords: ["catálogo", "prontos", "oferta", "publicar"] },
      { href: "/pricing", label: "Pricing & Margem", shortLabel: "Margem", icon: CircleDollarSign, phase: "agora", description: "Calcula custos, taxas, preço, margem e limites de segurança.", keywords: ["preço", "custos", "lucro", "taxas"] },
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
