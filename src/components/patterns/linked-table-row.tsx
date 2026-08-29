"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const INTERACTIVE =
  "a, button, input, select, textarea, label, [role='menuitem']";

/**
 * A table row that navigates to `href` when clicked anywhere that is not itself
 * an interactive element (a link, button, form field or menu item). The row must
 * still contain a real <Link> — e.g. on the primary cell — so keyboard users and
 * "open in new tab" keep working; this only extends the pointer target to the
 * rest of the row. Pass `href={null}` to render an ordinary, non-navigating row.
 *
 * Uses a click handler rather than a CSS overlay because `position: relative` on
 * <tr> is not honoured by every mobile browser, which left the overlay covering
 * unrelated page content.
 */
export function LinkedTableRow({
  href,
  onClick,
  className,
  children,
  ...props
}: ComponentProps<typeof TableRow> & { href?: string | null }) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event);
    if (!href || event.defaultPrevented) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    ) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) {
      return;
    }
    // The sibling <Link> in the row already type-checks this path.
    router.push(href as Route);
  }

  return (
    <TableRow
      onClick={handleClick}
      className={cn(href && "cursor-pointer", className)}
      {...props}
    >
      {children}
    </TableRow>
  );
}
