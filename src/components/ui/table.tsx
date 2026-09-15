"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  scrollerClassName,
  ...props
}: ComponentProps<"table"> & {
  /**
   * Extra classes for the scroll container that owns the border. Use it to cap
   * the height of a long table (`max-h-…`) so the page does not grow with the
   * row count; the rows then scroll inside the card.
   */
  scrollerClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className={cn(
          "w-full overflow-x-auto rounded-xl border border-border",
          scrollerClassName,
        )}
      >
        <table
          className={cn(
            "w-full caption-bottom text-sm",
            // Tables are uniformly left-aligned; the trailing row chevron is
            // dropped everywhere. Scoped to <table> so pagination arrows and
            // other ChevronRight icons outside tables are untouched.
            "[&_.lucide-chevron-right]:hidden",
            className,
          )}
          {...props}
        />
      </div>
      {/* Scroll affordance — shown only while more of the table sits off-screen */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-px left-px w-6 rounded-l-xl bg-gradient-to-r from-foreground/10 to-transparent transition-opacity duration-150",
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-px right-px w-6 rounded-r-xl bg-gradient-to-l from-foreground/10 to-transparent transition-opacity duration-150",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "bg-muted/60 [&_tr]:border-b [&_tr]:border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "border-t border-border bg-muted/60 font-medium [&_tr]:border-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors focus-within:bg-muted/40 hover:bg-muted/40",
        className,
      )}
      {...props}
    />
  );
}

/** Strip per-cell horizontal alignment — every table column is left-aligned. */
function leftAlign(className?: string): string | undefined {
  return className?.replace(/\btext-(right|center)\b/g, "").trim() || undefined;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-4 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        leftAlign(className),
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("px-4 py-3 text-left align-middle", leftAlign(className))}
      {...props}
    />
  );
}
