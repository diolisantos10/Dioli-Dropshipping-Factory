import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { navigationGroups } from "@/lib/factory-navigation";

export const metadata = { title: "Mapa da Factory" };

const flow = [
  { title: "Descobrir", detail: "Prateleira Bruta" },
  { title: "Decidir", detail: "Sala de Triagem" },
  { title: "Produzir", detail: "Produto + Mídia" },
  { title: "Precificar", detail: "Pricing & Margem" },
  { title: "Operar", detail: "Catálogo + Pedidos" },
  { title: "Aprender", detail: "Inteligência + Auditoria" },
];

export default function FactoryMapPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Comando / guia operacional</p>
        <h1 className="display-title">Mapa da Factory</h1>
        <p className="lede">A Factory leva uma oportunidade bruta até uma operação vendável, rastreável e capaz de aprender com os próprios resultados.</p>
      </header>

      <section className="surface p-6">
        <div className="section-heading"><div><h2>Fluxo principal</h2><p>A sequência normal de trabalho, do sinal inicial ao aprendizado.</p></div></div>
        <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {flow.map((step, index) => (
            <li key={step.title} className="relative rounded-lg border border-[#ddd9d1] bg-white p-4">
              <span className="font-mono text-[10px] font-bold text-[#ff5b2e]">0{index + 1}</span>
              <strong className="mt-3 block text-sm">{step.title}</strong>
              <span className="mt-1 block text-xs leading-5 text-[#696d75]">{step.detail}</span>
              {index < flow.length - 1 && <ArrowRight size={16} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-[#f4f1eb] text-[#ff5b2e] xl:block" />}
            </li>
          ))}
        </ol>
      </section>

      {navigationGroups.map((group) => (
        <section key={group.label}>
          <div className="section-heading"><div><h2>{group.label}</h2><p>{group.label === "Comando" ? "Entrada, decisões e orientação." : group.label === "Produção" ? "Construção da oferta comercial." : group.label === "Operação" ? "Execução e leitura de resultados." : "Conexões, controle e rastreabilidade."}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.items.filter((item) => item.href !== "/mapa-factory").map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="surface group flex min-h-36 flex-col p-5 transition-transform hover:-translate-y-0.5 hover:border-[#ff5b2e]">
                  <div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#ffe5dc] text-[#ff5b2e]"><Icon size={20} /></span><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${item.phase === "agora" ? "bg-[#dff3e7] text-[#157347]" : "bg-[#fff0cf] text-[#9b5c00]"}`}>{item.phase === "agora" ? "Disponível" : "Próxima fase"}</span></div>
                  <strong className="mt-4 text-base tracking-[-0.02em]">{item.label}</strong>
                  <span className="mt-1 text-xs leading-5 text-[#696d75]">{item.description}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <aside className="surface flex items-start gap-3 border-[#b9dfc8] bg-[#f3fbf6] p-5 text-sm leading-6 text-[#174d31]">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
        <p><strong>Regra de ouro:</strong> um produto só avança quando a etapa anterior deixa evidência suficiente. Assim preço, mídia, publicação e pedidos continuam ligados à decisão original.</p>
      </aside>
    </div>
  );
}
