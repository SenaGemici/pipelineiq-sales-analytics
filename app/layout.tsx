import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CrmProvider } from "@/components/crm-provider";
import { DashboardShell } from "@/components/dashboard-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PipelineIQ | Satış Analitiği",
  description: "CRM verisinden satış kararlarına: huni ve kanal analizi, kazanma olasılığı modeli, geriye dönük test edilmiş satış tahmini ve ekip performansı.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body><CrmProvider><DashboardShell>{children}</DashboardShell></CrmProvider></body>
    </html>
  );
}
