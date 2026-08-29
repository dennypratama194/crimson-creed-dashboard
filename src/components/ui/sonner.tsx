"use client";

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App toast host. Mounted once in the root providers. Trigger toasts with the
 * helpers in `src/lib/toast.ts` (or `import { toast } from "sonner"`).
 */
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      position="top-right"
      richColors
      closeButton
      style={
        {
          // Close button: inside the toast, snug in the top-right corner.
          "--toast-close-button-start": "auto",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(-30%, 30%)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !shadow-md !pr-9",
          title: "!text-sm !font-medium",
          description: "!text-xs",
          closeButton:
            "!border-transparent !bg-transparent hover:!bg-black/5 dark:hover:!bg-white/10 !opacity-70 hover:!opacity-100",
        },
      }}
      {...props}
    />
  );
}
