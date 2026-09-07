import "server-only";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { RelationListSort } from "@/lib/validation/relation";

export type Relation = Tables<"relations">;

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
  rows: Relation[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = RELATION_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase.from("relations").select("*", { count: "exact" });

  const search = options.search ? sanitizeSearch(options.search) : "";
  if (search) query = query.ilike("name", `%${search}%`);

  if ((options.sort ?? "recent") === "name") {
    query = query.order("name", { ascending: true });
  } else {
    query = query
      .order("joined_on", { ascending: false })
      .order("created_at", { ascending: false });
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getRelation(id: string): Promise<Relation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("relations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}
