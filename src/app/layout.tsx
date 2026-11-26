import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "MyFlat", template: "%s · MyFlat" },
  description: "Gestão de imóveis de temporada",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${interTight.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
