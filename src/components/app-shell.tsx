"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ServerStateBridge } from "@/components/server-state-bridge";
import { Bell, Menu, Search, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { flatNavigation, navigationGroups } from "@/lib/factory-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const current = flatNavigation.find((item) => item.href === pathname);
  const searchResults = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return flatNavigation.slice(0, 6);
    return flatNavigation.filter((item) =>
      [item.label, item.shortLabel, item.description, ...item.keywords]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigateTo(href: string) {
    router.push(href);
    setSearchOpen(false);
    setQuery("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchResults[0]) navigateTo(searchResults[0].href);
  }

  return (
    <div className="app-shell">
      <ServerStateBridge />
      <aside className="side-rail" data-open={navigationOpen} aria-label="Navegação principal">
        <div className="flex min-h-full flex-col px-4 py-5">
          <div className="mb-8 flex items-center justify-between px-2">
            <Link href="/visao-geral" className="flex items-center gap-3" onClick={() => setNavigationOpen(false)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[13px] font-black tracking-[-0.04em] text-[var(--accent-ink)]" aria-hidden="true">
                DDF
              </span>
              <span className="desktop-only leading-tight">
                <strong className="block text-sm tracking-[-0.02em]">Dioli Dropshipping Factory</strong>
                <span className="text-[11px] text-[var(--rail-muted)]">Inteligência em operação.</span>
              </span>
              <span className="sr-only">DDF — Dioli Dropshipping Factory</span>
            </Link>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center text-[var(--rail-ink)] md:hidden"
              onClick={() => setNavigationOpen(false)}
              aria-label="Fechar navegação"
            >
              <X size={19} />
            </button>
          </div>

          <nav className="flex-1 space-y-7">
            {navigationGroups.map((group) => (
              <div key={group.label}>
                <p className="desktop-only mb-2 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--rail-muted)]">
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
                          className={`nav-link group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${active ? "is-active" : ""}`}
                        >
                          <Icon size={18} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
                          <span className="nav-label desktop-only flex-1">{item.label}</span>
                          {item.phase === "depois" && (
                            <span className="desktop-only h-1.5 w-1.5 rounded-full bg-[var(--rail-muted)]" aria-label="Fase posterior" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="desktop-only mt-8 border-t border-[var(--rail-line)] px-2 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rail-muted)]">Marcas DDF</p>
            <p className="mt-2 text-xs text-[var(--rail-ink)]">Santioh · Dilee · Dilix · Queise</p>
            <div className="mt-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--rail-line)] text-xs font-bold">AD</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Administrador</p>
                <p className="truncate text-[10px] text-[var(--rail-muted)]">Aprovador principal</p>
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
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink)] md:hidden"
              onClick={() => setNavigationOpen(true)}
              aria-label="Abrir navegação"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">{current?.label ?? "DDF"}</p>
              <p className="hidden text-[11px] text-[var(--muted)] sm:block">DDF · Hub interno de operações de dropshipping</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <form
              className="relative hidden lg:block"
              onSubmit={submitSearch}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
              }}
              role="search"
            >
              <div className="flex h-10 min-w-80 items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-3 text-xs text-[var(--muted)] transition-colors focus-within:border-[var(--ink)]">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={searchInput}
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  className="min-w-0 flex-1 bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                  placeholder="Buscar áreas, produtos ou eventos"
                  aria-label="Buscar na fábrica"
                  autoComplete="off"
                />
                <kbd className="border border-[var(--line)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono text-[9px]">⌘K</kbd>
              </div>
              {searchOpen && (
                <div className="absolute right-0 top-12 z-50 w-[420px] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] shadow-xl" role="listbox" aria-label="Resultados da busca">
                  <div className="border-b border-[var(--line)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {query ? `${searchResults.length} resultado(s)` : "Acesso rápido"}
                  </div>
                  <div className="max-h-96 overflow-y-auto p-1.5">
                    {searchResults.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.href} type="button" onClick={() => navigateTo(item.href)} className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-[var(--canvas)]" role="option" aria-selected={pathname === item.href}>
                          <Icon size={17} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                          <span><strong className="block text-xs text-[var(--ink)]">{item.label}</strong><span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">{item.description}</span></span>
                        </button>
                      );
                    })}
                    {searchResults.length === 0 && <p className="px-3 py-5 text-center text-xs text-[var(--muted)]">Nenhuma área encontrada.</p>}
                  </div>
                </div>
              )}
            </form>
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]"
              aria-label="Notificações"
              disabled
              title="Notificações em construção"
            >
              <Bell size={17} />
            </button>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
