"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Gamepad2,
  Info,
  RefreshCw,
  Search,
  SignalHigh,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  FIVEM_LABELS,
  FIVEM_PLAYERS_PER_PAGE,
  FIVEM_REFRESH_INTERVAL_MS,
} from "@/lib/constants/fivem";
import { APP_TIME_ZONE } from "@/lib/format";
import type { FivemPlayer, FivemSnapshot } from "@/lib/validation/fivem";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function fetchSnapshot(): Promise<FivemSnapshot> {
  const res = await fetch("/api/fivem", { cache: "no-store" });
  if (!res.ok) throw new Error(`Snapshot request failed (${res.status})`);
  return (await res.json()) as FivemSnapshot;
}

function pingTone(ping: number): "gray" | "success" | "warning" | "error" {
  if (ping < 0) return "gray";
  if (ping <= 80) return "success";
  if (ping <= 150) return "warning";
  return "error";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

export function FivemMonitor({
  initialSnapshot,
}: {
  initialSnapshot: FivemSnapshot;
}) {
  const [auto, setAuto] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(FIVEM_PLAYERS_PER_PAGE);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["fivem-snapshot"],
    queryFn: fetchSnapshot,
    initialData: initialSnapshot,
    refetchInterval: auto ? FIVEM_REFRESH_INTERVAL_MS : false,
    refetchOnWindowFocus: auto,
  });

  const snapshot = data ?? initialSnapshot;

  const filtered = useMemo<FivemPlayer[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.players;
    return snapshot.players.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.id).includes(q),
    );
  }, [search, snapshot.players]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  // Reset the window whenever the filter changes so "Show more" starts fresh.
  function handleSearch(value: string) {
    setSearch(value);
    setVisibleCount(FIVEM_PLAYERS_PER_PAGE);
  }

  const capacityPct =
    snapshot.maxClients && snapshot.maxClients > 0
      ? Math.min(
          100,
          Math.round((snapshot.playerCount / snapshot.maxClients) * 100),
        )
      : null;

  // The public directory knows the server is up and how full it is, but not who
  // is on it. Say that plainly instead of rendering an empty roster that reads
  // like nobody is playing.
  const rosterUnavailable = snapshot.source === "directory";

  return (
    <div className="flex flex-col gap-6">
      {/* Server identity + controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">
              {snapshot.projectName ?? snapshot.hostname ?? "FiveM server"}
            </span>
            <Badge tone={snapshot.online ? "success" : "error"}>
              {snapshot.online ? FIVEM_LABELS.online : FIVEM_LABELS.offline}
            </Badge>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {snapshot.host}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAuto((v) => !v)}
            aria-pressed={auto}
          >
            <SignalHigh
              className={cn(
                auto ? "text-tone-success-fg" : "text-muted-foreground",
              )}
            />
            {auto ? "Auto" : "Manual"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button asChild size="sm">
            <a href={snapshot.connectUri}>Connect</a>
          </Button>
        </div>
      </div>

      {snapshot.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-tone-error-border bg-tone-error-bg px-4 py-3 text-sm text-tone-error-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{snapshot.error}</span>
        </div>
      ) : null}

      {rosterUnavailable ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Couldn&rsquo;t reach the relay machine, so this is read from the
            public FiveM directory instead. The player count is accurate to
            within a few minutes; names are not published there.
          </span>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Status"
          value={snapshot.online ? FIVEM_LABELS.online : FIVEM_LABELS.offline}
        />
        <KpiCard
          label="Players"
          value={
            snapshot.maxClients
              ? `${snapshot.playerCount} / ${snapshot.maxClients}`
              : snapshot.playerCount
          }
          icon={Users}
        />
        <KpiCard
          label="Latency"
          value={snapshot.latencyMs != null ? `${snapshot.latencyMs} ms` : "—"}
          hint={rosterUnavailable ? "Directory round-trip" : "Proxy round-trip"}
        />
        <KpiCard
          label="Updated"
          value={formatTime(snapshot.fetchedAt)}
          hint={auto ? "Auto every 10s" : "Manual"}
        />
      </div>

      {/* Capacity bar */}
      {capacityPct != null ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Capacity</span>
            <span className="tabular-nums">
              {snapshot.playerCount}/{snapshot.maxClients} · {capacityPct}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={capacityPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Player list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">
            Players online{" "}
            <span className="text-muted-foreground tabular-nums">
              {rosterUnavailable
                ? `(${snapshot.playerCount})`
                : filtered.length === snapshot.players.length
                  ? `(${snapshot.players.length})`
                  : `(${filtered.length} of ${snapshot.players.length})`}
            </span>
          </h2>
          {rosterUnavailable ? null : (
            <div className="relative w-full max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Filter by name or ID"
                className="pl-9"
                aria-label="Filter players"
              />
            </div>
          )}
        </div>

        {rosterUnavailable ? (
          <EmptyState
            icon={Users}
            title="Player list unavailable"
            description={`${snapshot.playerCount} online right now, but the public directory does not publish player names. Start the uplink on the relay PC to see the roster.`}
          />
        ) : snapshot.players.length === 0 ? (
          <EmptyState
            icon={Users}
            title={snapshot.online ? "No players online" : "Server unreachable"}
            description={
              snapshot.online
                ? "The server is up but nobody is connected, or it hides its player list."
                : "Re-check when the server is back online."
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`Nothing matches “${search}”.`}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {visible.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {player.id}
                    </span>
                    <span className="truncate text-sm">{player.name}</span>
                  </div>
                  <Badge tone={pingTone(player.ping)}>
                    {player.ping < 0 ? "n/a" : `${player.ping} ms`}
                  </Badge>
                </li>
              ))}
            </ul>
            {remaining > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="self-center"
                onClick={() =>
                  setVisibleCount((c) => c + FIVEM_PLAYERS_PER_PAGE)
                }
              >
                Show more
                <span className="text-muted-foreground tabular-nums">
                  {remaining}
                </span>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
