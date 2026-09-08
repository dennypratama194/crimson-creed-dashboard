/**
 * Every relation owes a fixed metal-scrap prerequisite. Settling a relation
 * (`metal_scrap_settled`) posts this quantity to the Metal Scrap company-stash
 * item; reopening it reverses the same amount. Mirrors the constant in
 * `supabase/migrations/0051_relation_details.sql` — change both together.
 * The server is the source of truth; the UI only uses this for copy.
 */
export const RELATION_METAL_SCRAP_QUANTITY = 250;
