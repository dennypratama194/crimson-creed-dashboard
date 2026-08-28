import { Badge } from "@/components/ui/badge";

export function StockBadge({ state }: { state: "ok" | "low" | "out" }) {
  if (state === "out") return <Badge tone="error">Out of stock</Badge>;
  if (state === "low") return <Badge tone="warning">Low</Badge>;
  return <Badge tone="success">In stock</Badge>;
}
