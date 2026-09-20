import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DDF Control Room",
    template: "%s · DDF Control Room",
  },
  description:
    "Control Room da Dioli Dropshipping Factory — seleção, produção, margem e distribuição de produtos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
