"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentProps, type MouseEvent } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const INTERACTIVE =
  "a, button, input, select, textarea, label, [role='menuitem']";

/** Any open Radix modal surface — dialog, alert dialog, dropdown, select. */
const OPEN_LAYER =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

/**
 * A modal disables pointer events on the page behind it, so the press that
 * dismisses it lands on the document, not a row — but the *trailing* `click`
 * fires once pointer events are restored and can hit a row. Record the moment an
 * open overlay is dismissed so that click can be ignored. One document-level
 * listener for the whole app.
 */
let lastOverlayDismissAt = -Infinity;
let watching = false;
function watchOverlayDismiss() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      const layer = document.querySelector(OPEN_LAYER);
      if (
        layer &&
        event.target instanceof Node &&
        !layer.contains(event.target)
      ) {
        lastOverlayDismissAt = event.timeStamp;
      }
    },
    true,
  );
}

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
 *
 * While a modal (dialog / dropdown / select) is open the row never navigates,
 * and the click that dismisses a modal by pressing the page behind it is
 * swallowed too.
 */
export function LinkedTableRow({
  href,
  onClick,
  className,
  children,
  ...props
}: ComponentProps<typeof TableRow> & { href?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    watchOverlayDismiss();
  }, []);

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event);
    if (!href || event.defaultPrevented) return;
    if (
      document.querySelector(OPEN_LAYER) ||
      event.timeStamp - lastOverlayDismissAt < 500
    ) {
      return;
    }
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
