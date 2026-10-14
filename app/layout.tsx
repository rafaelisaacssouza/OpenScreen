import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenScreen — compartilhe sua tela com um IP de acesso",
  description: "Compartilhamento de tela direto no navegador, sem instalar nada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=Unbounded:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
