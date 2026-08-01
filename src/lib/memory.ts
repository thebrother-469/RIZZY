import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MemoryCategory = Database["public"]["Enums"]["memory_category"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type MemoryInsert = Database["public"]["Tables"]["memories"]["Insert"];

export const MEMORY_CATEGORIES: { value: MemoryCategory; label: string; emoji: string }[] = [
  { value: "goals", label: "Goals", emoji: "🎯" },
  { value: "strengths", label: "Strengths", emoji: "💪" },
  { value: "weaknesses", label: "Weaknesses", emoji: "🩹" },
  { value: "preferences", label: "Preferences", emoji: "⚙️" },
  { value: "achievements", label: "Achievements", emoji: "🏆" },
  { value: "missions", label: "Missions", emoji: "🎖️" },
  { value: "conversation_style", label: "Style", emoji: "💬" },
  { value: "relationships", label: "Relationships", emoji: "💞" },
  { value: "coaching_notes", label: "Coach Notes", emoji: "📓" },
  { value: "general", label: "General", emoji: "🧠" },
];

export const CATEGORY_LABEL: Record<MemoryCategory, string> = Object.fromEntries(
  MEMORY_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<MemoryCategory, string>;

export async function listMemories(opts?: {
  archived?: boolean;
  category?: MemoryCategory | "all";
  search?: string;
  sort?: "newest" | "oldest" | "last_used" | "importance";
}) {
  let q = supabase.from("memories").select("*");
  q = q.eq("archived", opts?.archived ?? false);
  if (opts?.category && opts.category !== "all") q = q.eq("category", opts.category);
  if (opts?.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,()]/g, " ");
    q = q.or(`title.ilike.%${s}%,content.ilike.%${s}%`);
  }
  switch (opts?.sort ?? "newest") {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "last_used":
      q = q.order("last_used_at", { ascending: false, nullsFirst: false });
      break;
    case "importance":
      q = q.order("importance", { ascending: false }).order("created_at", { ascending: false });
      break;
    default:
      q = q.order("pinned", { ascending: false }).order("created_at", { ascending: false });
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createMemory(input: {
  title: string;
  content: string;
  category: MemoryCategory;
  importance?: number;
  pinned?: boolean;
  source?: string;
  coach_id?: string | null;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      title: input.title,
      content: input.content,
      category: input.category,
      importance: input.importance ?? 3,
      pinned: input.pinned ?? false,
      source: input.source ?? "manual",
      coach_id: input.coach_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMemory(id: string, patch: Partial<MemoryInsert>) {
  const { data, error } = await supabase
    .from("memories")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMemory(id: string) {
  const { error } = await supabase.from("memories").delete().eq("id", id);
  if (error) throw error;
}

export async function pinMemory(id: string, pinned: boolean) {
  return updateMemory(id, { pinned });
}

export async function archiveMemory(id: string, archived: boolean) {
  return updateMemory(id, { archived });
}

export async function bulkDelete(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("memories").delete().in("id", ids);
  if (error) throw error;
}

export async function exportMemories() {
  const list = await listMemories({ archived: false });
  const archived = await listMemories({ archived: true });
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    memories: [...list, ...archived],
  };
}

/** Loose shape of a memory row coming from a user-supplied export file. */
interface ImportedMemory {
  title?: unknown;
  content?: unknown;
  category?: unknown;
  importance?: unknown;
  pinned?: unknown;
  archived?: unknown;
}

export async function importMemories(payload: unknown) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const raw = (payload as { memories?: unknown } | null)?.memories;
  const items: ImportedMemory[] = Array.isArray(raw) ? (raw as ImportedMemory[]) : [];
  if (!items.length) return 0;
  const rows = items
    .filter((m) => !!m && !!m.title && !!m.content && !!m.category)
    .map((m) => ({
      user_id: user.id,
      title: String(m.title).slice(0, 200),
      content: String(m.content).slice(0, 4000),
      category: m.category as MemoryCategory,
      importance: Math.max(1, Math.min(5, Number(m.importance) || 3)),
      pinned: Boolean(m.pinned),
      archived: Boolean(m.archived),
      source: "import",
    }));
  if (!rows.length) return 0;
  const { error, data } = await supabase.from("memories").insert(rows).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function clearAllMemories() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("memories").delete().eq("user_id", user.id);
  if (error) throw error;
}

export async function memoryStats() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { total: 0, pinned: 0, recent: 0 };
  const [{ count: total }, { count: pinned }, { count: recent }] = await Promise.all([
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("archived", false),
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("pinned", true)
      .eq("archived", false),
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("last_used_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
  ]);
  return { total: total ?? 0, pinned: pinned ?? 0, recent: recent ?? 0 };
}
