import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  FileClock,
  Gauge,
  Images,
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
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Comando",
    items: [
      { href: "/visao-geral", label: "Visão geral", shortLabel: "Visão", icon: Gauge, phase: "agora" },
      { href: "/prateleira-bruta", label: "Prateleira Bruta", shortLabel: "Entrada", icon: PackageOpen, phase: "agora" },
      { href: "/triagem", label: "Sala de Triagem", shortLabel: "Triagem", icon: ClipboardCheck, phase: "agora" },
    ],
  },
  {
    label: "Produção",
    items: [
      { href: "/product-factory", label: "Product Factory", shortLabel: "Produto", icon: Factory, phase: "agora" },
      { href: "/media-factory", label: "Media Factory", shortLabel: "Mídia", icon: Images, phase: "agora" },
      { href: "/disponiveis", label: "Produtos Disponíveis", shortLabel: "Prontos", icon: PackageCheck, phase: "agora" },
      { href: "/pricing", label: "Pricing & Margem", shortLabel: "Margem", icon: CircleDollarSign, phase: "agora" },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/pedidos", label: "Pedidos & Tracking", shortLabel: "Pedidos", icon: ShoppingBag, phase: "depois" },
      { href: "/inteligencia", label: "Intelligence Room", shortLabel: "Dados", icon: BrainCircuit, phase: "agora" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/integracoes", label: "Connector Hubs", shortLabel: "Conexões", icon: PlugZap, phase: "depois" },
      { href: "/auditoria", label: "Auditoria & Eventos", shortLabel: "Auditoria", icon: FileClock, phase: "agora" },
    ],
  },
];

export const flatNavigation = navigationGroups.flatMap((group) => group.items);
