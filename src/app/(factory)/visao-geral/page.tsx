import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Factory,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Visão geral",
};

const metrics = [
  { label: "Candidatos brutos", value: "24", delta: "+6 esta semana", tone: "neutral" },
  { label: "Aguardando triagem", value: "08", delta: "Sua aprovação", tone: "attention" },
  { label: "Em produção", value: "05", delta: "2 próximos de concluir", tone: "neutral" },
  { label: "Margem protegida", value: "100%", delta: "Nenhum bloqueio crítico", tone: "success" },
];

const pipeline = [
  { label: "Candidatos", count: 24, width: "100%", color: "#c8c2b8" },
  { label: "Triagem", count: 8, width: "64%", color: "#ffb28e" },
  { label: "Aprovados", count: 5, width: "43%", color: "#ff7a4f" },
  { label: "Em produção", count: 5, width: "43%", color: "#ff5b2e" },
  { label: "Prontos", count: 2, width: "22%", color: "#17191d" },
];

const approvals = [
  { name: "Luminária magnética modular", source: "Entrada manual", age: "há 18 min", score: "86/100", risk: "Baixo" },
  { name: "Organizador giratório de cozinha", source: "Trend Brasil", age: "há 1 h", score: "78/100", risk: "Baixo" },
  { name: "Mini projetor portátil P30", source: "Trend Global", age: "há 3 h", score: "74/100", risk: "Revisar" },
];

const activity = [
  { title: "Candidato enviado para triagem", detail: "Luminária magnética modular", time: "10:42", icon: PackageOpen },
  { title: "Ficha comercial concluída", detail: "Mochila urbana impermeável", time: "09:18", icon: CheckCircle2 },
  { title: "Margin Guard acionado", detail: "Fone esportivo TWS · frete sem confirmação", time: "08:55", icon: ShieldCheck },
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 border-b border-[#ddd9d1] pb-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)] lg:items-end">
        <div>
          <p className="eyebrow">Control Room / turno atual</p>
          <h1 className="display-title">A fábrica está sob controle.</h1>
          <p className="lede">
            Veja o que entrou, o que precisa da sua decisão e onde cada produto está no processo — antes de qualquer gasto ou publicação.
          </p>
        </div>
        <div className="surface flex items-start gap-4 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#17191d] text-white">
            <Sparkles size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold">Próxima decisão</p>
            <p className="mt-1 text-sm leading-6 text-[#696d75]">8 candidatos aguardam sua triagem. Nenhum processo premium foi iniciado.</p>
            <Link href="/triagem" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#d83f12] hover:underline">
              Abrir Sala de Triagem <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border border-[#ddd9d1] bg-[#ddd9d1] sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="bg-[#fbfaf7] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-[#696d75]">{metric.label}</p>
              <span
                className={`status-dot ${
                  metric.tone === "success" ? "text-[#157347]" : metric.tone === "attention" ? "text-[#ff5b2e]" : "text-[#a4a099]"
                }`}
              />
            </div>
            <p className="mt-6 text-4xl font-semibold tracking-[-0.055em]">{metric.value}</p>
            <p className="mt-2 text-[11px] text-[#858991]">{metric.delta}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <article className="surface p-6">
          <div className="section-heading">
            <div>
              <h2>Fluxo da fábrica</h2>
              <p>Volume atual por portão operacional</p>
            </div>
            <Factory size={20} className="text-[#8b8f97]" />
          </div>
          <div className="space-y-4 pt-3">
            {pipeline.map((item) => (
              <div key={item.label} className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3">
                <span className="text-xs text-[#5f636b]">{item.label}</span>
                <div className="h-3 overflow-hidden bg-[#ebe7e0]">
                  <div className="h-full" style={{ width: item.width, backgroundColor: item.color }} />
                </div>
                <strong className="text-right font-mono text-xs">{String(item.count).padStart(2, "0")}</strong>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#e3dfd8] pt-4 text-[11px] text-[#777b83]">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 bg-[#ff5b2e]" /> processamento ativo</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 bg-[#17191d]" /> produto pronto</span>
          </div>
        </article>

        <article className="surface overflow-hidden">
          <div className="section-heading border-b border-[#e3dfd8] px-6 py-5">
            <div>
              <h2>Saúde operacional</h2>
              <p>Base simulada, sem serviços externos</p>
            </div>
            <span className="font-mono text-[10px] font-bold text-[#157347]">ESTÁVEL</span>
          </div>
          <div className="divide-y divide-[#e3dfd8]">
            <HealthRow icon={CheckCircle2} label="Núcleo da fábrica" detail="Disponível" state="ok" />
            <HealthRow icon={Clock3} label="Filas internas" detail="3 jobs ativos" state="ok" />
            <HealthRow icon={CircleAlert} label="Conectores externos" detail="Adiados por decisão" state="neutral" />
          </div>
        </article>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <h2>Aguardando sua aprovação</h2>
            <p>Os candidatos permanecem baratos até uma decisão explícita.</p>
          </div>
          <Link href="/triagem" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#d83f12] hover:underline">
            Ver todos <ArrowRight size={14} />
          </Link>
        </div>
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ddd9d1] bg-[#f0ede7] font-mono text-[9px] uppercase tracking-[0.12em] text-[#6f737b]">
                <th className="px-5 py-3 font-semibold">Candidato</th>
                <th className="px-5 py-3 font-semibold">Origem</th>
                <th className="px-5 py-3 font-semibold">Entrada</th>
                <th className="px-5 py-3 font-semibold">Potencial</th>
                <th className="px-5 py-3 font-semibold">Risco</th>
                <th className="px-5 py-3 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e1da]">
              {approvals.map((item) => (
                <tr key={item.name} className="bg-[#fbfaf7] transition-colors hover:bg-white">
                  <td className="px-5 py-4 text-sm font-semibold">{item.name}</td>
                  <td className="px-5 py-4 text-xs text-[#696d75]">{item.source}</td>
                  <td className="px-5 py-4 text-xs text-[#696d75]">{item.age}</td>
                  <td className="px-5 py-4 font-mono text-xs font-semibold">{item.score}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold ${item.risk === "Baixo" ? "text-[#157347]" : "text-[#9b5c00]"}`}>{item.risk}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href="/triagem" className="inline-flex h-8 items-center border border-[#cfcac1] bg-white px-3 text-xs font-semibold transition-colors hover:border-[#17191d]">
                      Avaliar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <h2>Atividade recente</h2>
            <p>Trilha resumida das últimas movimentações.</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {activity.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="surface flex items-start gap-4 p-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#ece8e1] text-[#50545c]"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-[#73777f]">{item.detail}</p>
                </div>
                <time className="font-mono text-[10px] text-[#91959c]">{item.time}</time>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  detail,
  state,
}: {
  icon: typeof CheckCircle2;
  label: string;
  detail: string;
  state: "ok" | "neutral";
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <Icon size={17} className={state === "ok" ? "text-[#157347]" : "text-[#8b8f97]"} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-[#777b83]">{detail}</span>
    </div>
  );
}
