"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ServerStateBridge } from "@/components/server-state-bridge";
import { Bell, Menu, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { flatNavigation, navigationGroups } from "@/lib/factory-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const current = flatNavigation.find((item) => item.href === pathname);

  return (
    <div className="app-shell">
      <ServerStateBridge />
      <aside className="side-rail" data-open={navigationOpen} aria-label="Navegação principal">
        <div className="flex min-h-full flex-col px-4 py-5">
          <div className="mb-8 flex items-center justify-between px-2">
            <Link href="/visao-geral" className="flex items-center gap-3" onClick={() => setNavigationOpen(false)}>
              <span className="grid h-10 w-10 place-items-center bg-[#ff5b2e] text-sm font-black tracking-[-0.08em] text-white">
                DDF
              </span>
              <span className="desktop-only leading-tight">
                <strong className="block text-sm tracking-[-0.02em]">Dioli Dropshipping Factory</strong>
                <span className="text-[11px] text-[#969aa3]">Fábrica operacional</span>
              </span>
            </Link>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center text-[#c8cbd1] md:hidden"
              onClick={() => setNavigationOpen(false)}
              aria-label="Fechar navegação"
            >
              <X size={19} />
            </button>
          </div>

          <nav className="flex-1 space-y-7">
            {navigationGroups.map((group) => (
              <div key={group.label}>
                <p className="desktop-only mb-2 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#666b74]">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={item.label}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setNavigationOpen(false)}
                          className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${
                            active
                              ? "bg-white text-[#17191d]"
                              : "text-[#a9adb5] hover:bg-[#21242a] hover:text-white"
                          }`}
                        >
                          <Icon size={18} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
                          <span className="desktop-only flex-1">{item.label}</span>
                          {item.phase === "depois" && (
                            <span className="desktop-only h-1.5 w-1.5 rounded-full bg-[#626771]" aria-label="Fase posterior" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="desktop-only mt-8 border-t border-[#292c32] px-2 pt-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2a2d33] text-xs font-bold">AD</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Administrador</p>
                <p className="truncate text-[10px] text-[#858a94]">Aprovador principal</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {navigationOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/45 md:hidden"
          onClick={() => setNavigationOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className="main-column">
        <header className="top-bar">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#ddd9d1] bg-white text-[#17191d] md:hidden"
              onClick={() => setNavigationOpen(true)}
              aria-label="Abrir navegação"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">{current?.label ?? "DDF"}</p>
              <p className="hidden text-[11px] text-[#747880] sm:block">Ambiente controlado · Dados simulados</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden h-10 min-w-64 items-center gap-3 rounded-md border border-[#ddd9d1] bg-white px-3 text-left text-xs text-[#777b83] transition-colors hover:border-[#b9b5ad] lg:flex"
              aria-label="Buscar na fábrica"
              disabled
              title="Busca global em construção; use a busca na Prateleira Bruta"
            >
              <Search size={16} />
              <span className="flex-1">Buscar produtos, jobs ou eventos</span>
              <kbd className="border border-[#e2ded7] bg-[#f6f3ee] px-1.5 py-0.5 font-mono text-[9px]">⌘K</kbd>
            </button>
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-md border border-[#ddd9d1] bg-white text-[#4d5159] transition-colors hover:border-[#b9b5ad] hover:text-[#17191d]"
              aria-label="Notificações"
              disabled
              title="Notificações em construção"
            >
              <Bell size={17} />
            </button>
            <div className="hidden items-center gap-2 border-l border-[#ddd9d1] pl-3 sm:flex">
              <ShieldCheck size={17} className="text-[#157347]" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#157347]">Demonstração</p>
                <p className="text-[10px] text-[#777b83]">Sem operações externas</p>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
