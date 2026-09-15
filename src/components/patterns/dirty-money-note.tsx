import { Banknote } from "lucide-react";

/**
 * Operations money is DIRTY money and is deliberately not wired to the
 * treasury: settling a draw or marking production paid posts nothing to
 * `cash_entries`, so these figures never appear in Company cash. Both pages say
 * so in the same words, because the two totals genuinely will not reconcile and
 * that needs to read as intentional rather than as a bug.
 */
export function DirtyMoneyNote({
  scope,
}: {
  scope: "distribution" | "production";
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle px-4 py-3 text-sm text-muted-foreground">
      <Banknote className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-foreground">
          Amounts here are dirty money.
        </span>{" "}
        {scope === "distribution"
          ? "What a member owes on a draw is settled between them and the company — marking one done records that it happened."
          : "Marking someone paid records that it happened."}{" "}
        It is tracked separately from Company cash and never posts to the
        treasury, so the two will not add up.
      </span>
    </div>
  );
}
