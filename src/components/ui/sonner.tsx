"use client";

import { useTheme } from "next-themes";
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
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !shadow-md",
          title: "!text-sm !font-medium",
          description: "!text-xs",
        },
      }}
      {...props}
    />
  );
}
