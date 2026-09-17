import "server-only";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/db/ids";
import { getMemberNames } from "@/lib/db/members";
import { pageBounds } from "@/lib/db/paging";
import type { RelationListSort } from "@/lib/validation/relation";

export type Relation = Tables<"relations">;

/** A relation row decorated with the handler's display name for list rendering. */
export type RelationListRow = Relation & { handler_name: string | null };

export const RELATION_PAGE_SIZE = 20;

function sanitizeSearch(input: string): string {
  return input
    .replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 80);
}

export type ListRelationsOptions = {
  page?: number;
  search?: string;
  sort?: RelationListSort;
};

export async function listRelations(options: ListRelationsOptions): Promise<{
  rows: RelationListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = RELATION_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  let query = supabase.from("relations").select("*", { count: "exact" });

  const search = options.search ? sanitizeSearch(options.search) : "";
  if (search) query = query.ilike("name", `%${search}%`);

  if ((options.sort ?? "recent") === "name") {
    query = query
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  } else {
    query = query
      .order("joined_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const relations = data ?? [];
  const names = await getMemberNames(
    relations
      .map((r) => r.handler_member_id)
      .filter((id): id is string => !!id),
  );
  const rows: RelationListRow[] = relations.map((r) => ({
    ...r,
    handler_name: r.handler_member_id
      ? (names.get(r.handler_member_id) ?? null)
      : null,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

export async function getRelation(id: string): Promise<Relation | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("relations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
