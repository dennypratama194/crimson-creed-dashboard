import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/logo.webp"
          alt="Crimson Creed"
          width={104}
          height={159}
          priority
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          There is no self-service reset for this system.
        </p>
      </header>

      <div className="rounded-md border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Ask a Super Admin to set a new password for your account. They will
          share it with you securely. Once you are signed in, you can change it
          from your profile.
        </p>
      </div>

      <Button asChild size="lg" variant="secondary" className="w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
