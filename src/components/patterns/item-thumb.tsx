import { Package } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

const SIZE = { sm: 32, md: 40, lg: 56 } as const;

export function ItemThumb({
  src,
  name,
  size = "md",
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const px = SIZE[size];

  if (!src) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground",
          className,
        )}
        style={{ width: px, height: px }}
      >
        <Package className="size-1/2" />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={name}
      width={px}
      height={px}
      className={cn(
        "shrink-0 rounded-md bg-subtle object-contain p-1",
        className,
      )}
      style={{ width: px, height: px }}
    />
  );
}
