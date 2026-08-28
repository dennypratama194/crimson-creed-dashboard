import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
