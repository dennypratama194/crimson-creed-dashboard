"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Trimmed, with inner runs of whitespace collapsed: what a search "is". */
export function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * The search box on the admin list pages, driving `?q=` (or `param`).
 *
 * Typing never navigates: every navigation re-renders the whole page on the
 * server — auth, the badge, the list query and its count — so a term is only
 * sent on Enter or the Search button, and not at all when it normalizes to the
 * one already in the URL. A new term starts from page 1 and keeps every other
 * filter in the URL. Each search is its own history entry, and when the URL
 * changes under the field (back / forward, a link) the field follows it.
 */
export function UrlSearchField({
  placeholder,
  label,
  param = "q",
  className,
}: {
  placeholder: string;
  /** Accessible name of the input. */
  label: string;
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlValue = params.get(param) ?? "";
  const [draft, setDraft] = useState(urlValue);
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue);
  if (urlValue !== seenUrlValue) {
    // The URL moved without us (back / forward): show what it now searches.
    setSeenUrlValue(urlValue);
    setDraft(urlValue);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = normalizeSearch(draft);
    if (term === normalizeSearch(urlValue)) {
      setDraft(term);
      return;
    }
    const next = new URLSearchParams(params);
    if (term) next.set(param, term);
    else next.delete(param);
    next.delete("page");
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}` as Route);
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className={cn("flex items-center gap-2 sm:w-80", className)}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          enterKeyHint="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label={label}
        />
      </div>
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
