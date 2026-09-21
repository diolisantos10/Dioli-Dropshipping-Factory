import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DDF — Dioli Dropshipping Factory",
    template: "%s · DDF",
  },
  description:
    "Dioli Dropshipping Factory — seleção, produção, margem e distribuição de produtos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
