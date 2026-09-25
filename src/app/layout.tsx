import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "@/app/providers";
import { brand, brandCss } from "@/lib/brand";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono-geist",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: brand.appName,
    template: `%s · ${brand.appName}`,
  },
  description: `Private internal operations platform for ${brand.name}.`,
  icons: brand.icon
    ? { icon: brand.icon, apple: brand.appleIcon ?? undefined }
    : undefined,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full`}
    >
      {brand.isCrimson ? null : (
        <head>
          <style>{brandCss()}</style>
        </head>
      )}
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
