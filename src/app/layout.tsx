import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Camouflage System",
  description: "Sistema automatizado para camuflagem de marcas em produtos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
