import { AppShell } from "@/components/app-shell";

export default function FactoryLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
