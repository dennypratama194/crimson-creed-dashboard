"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <NuqsAdapter>{children}</NuqsAdapter>
      </QueryProvider>
    </ThemeProvider>
  );
}
