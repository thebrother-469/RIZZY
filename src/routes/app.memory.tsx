import { createFileRoute } from "@tanstack/react-router";
import { useUserTitle } from "@/hooks/use-title";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Brain,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
  Plus,
  Download,
  Upload,
  Loader2,
  X,
  Save,
  Edit3,
  Star,
  Filter,
  ArrowDownAZ,
} from "lucide-react";
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  pinMemory,
  archiveMemory,
  exportMemories,
  importMemories,
  clearAllMemories,
  memoryStats,
  MEMORY_CATEGORIES,
  CATEGORY_LABEL,
  type Memory,
  type MemoryCategory,
} from "@/lib/memory";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/app/memory")({
  head: () => ({
    meta: [
      { title: "AI Memory Manager — RizzGod AI" },
      {
        name: "description",
        content:
          "Manage what your RizzGod AI coach remembers about you. Pin key facts, archive old context, and shape smarter, more personal advice.",
      },
      { property: "og:title", content: "AI Memory Manager — RizzGod AI" },
      {
        property: "og:description",
        content:
          "Control what your RizzGod AI coach remembers — pin, archive, and curate your context.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/memory" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/memory" }],
  }),
  component: MemoryManager,
});

type SortKey = "newest" | "oldest" | "last_used" | "importance";

function MemoryManager() {
  const title = useUserTitle();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [editing, setEditing] = useState<Memory | null>(null);
  const [creating, setCreating] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  // Debounce the search box. The state update happens inside a timeout, so it
  // is never a synchronous setState from the effect body.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Fetching lives in TanStack Query instead of a fetch-in-effect, so filter
  // changes refetch declaratively without cascading renders.
  const { data, isPending, refetch } = useQuery({
    queryKey: ["memories", user?.id, showArchived, category, sort, debouncedSearch],
    enabled: !!user?.id,
    queryFn: async () => {
      const [items, s] = await Promise.all([
        listMemories({ archived: showArchived, category, search: debouncedSearch, sort }),
        memoryStats(),
      ]);
      return { items: items as Memory[], stats: s };
    },
  });

  const memories = data?.items ?? [];
  const stats = data?.stats ?? { total: 0, pinned: 0, recent: 0 };
  const loading = isPending;
  const reload = async () => {
    const res = await refetch();
    if (res.error) toast.error((res.error as Error)?.message ?? "Failed to load memories");
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("memory_enabled")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMemoryEnabled(data?.memory_enabled ?? true));
  }, [user?.id]);

  const toggleMemory = async (enabled: boolean) => {
    if (!user) return;
    setMemoryEnabled(enabled);
    await supabase.from("profiles").update({ memory_enabled: enabled }).eq("id", user.id);
    toast.success(enabled ? "Memory ON — coach will personalize" : "Memory OFF — coach runs blind");
  };

  const handlePin = async (m: Memory) => {
    await pinMemory(m.id, !m.pinned);
    void reload();
  };
  const handleArchive = async (m: Memory) => {
    await archiveMemory(m.id, !m.archived);
    toast.success(m.archived ? "Restored" : "Archived");
    void reload();
  };
  const handleDelete = async (m: Memory) => {
    if (!confirm(`Delete "${m.title}"? This can't be undone.`)) return;
    await deleteMemory(m.id);
    toast.success("Deleted");
    void reload();
  };

  const handleExport = async () => {
    const data = await exportMemories();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rizzgod-memories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported.");
  };

  const handleImport = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const n = await importMemories(JSON.parse(text));
        toast.success(`Imported ${n} memories`);
        void reload();
      } catch (err: unknown) {
        toast.error(errorMessage(err, "Import failed"));
      }
    };
    inp.click();
  };

  const handleClearAll = async () => {
    if (!confirm("Wipe ALL memories permanently? Type this only if you're sure.")) return;
    if (!confirm("Last chance. Really nuke everything?")) return;
    await clearAllMemories();
    toast.success("All memories cleared.");
    void reload();
  };

  const grouped = useMemo(() => {
    const g = new Map<MemoryCategory, Memory[]>();
    memories.forEach((m) => {
      const arr = g.get(m.category) ?? [];
      arr.push(m);
      g.set(m.category, arr);
    });
    return g;
  }, [memories]);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">
            Memory Manager
          </div>
          <h1 className="display text-3xl md:text-4xl truncate">
            The <span className="text-gradient-blood">AI knows you</span>.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{title.sentence("This is your edge")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Every coach reads this. Pin what matters most.
          </p>
        </div>
        <label className="shrink-0 inline-flex items-center gap-2 bg-card border border-border/60 rounded-lg px-3 py-2 text-xs">
          <span className="text-muted-foreground">AI Memory</span>
          <input
            type="checkbox"
            checked={memoryEnabled}
            onChange={(e) => toggleMemory(e.target.checked)}
            className="accent-primary h-4 w-4"
          />
          <span className={`font-bold ${memoryEnabled ? "text-success" : "text-destructive"}`}>
            {memoryEnabled ? "ON" : "OFF"}
          </span>
        </label>
      </header>

      {/* stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatMini icon={<Brain size={14} />} label="Total" value={stats.total} />
        <StatMini icon={<Pin size={14} />} label="Pinned" value={stats.pinned} accent="gold" />
        <StatMini icon={<Star size={14} />} label="Used this week" value={stats.recent} />
      </div>

      {/* toolbar */}
      <div className="bg-card border border-border/60 rounded-2xl p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
              aria-label="Search memories"
              className="w-full bg-secondary/50 border border-border/60 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory | "all")}
            aria-label="Filter by category"
            className="bg-secondary/50 border border-border/60 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All categories</option>
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort memories"
            className="bg-secondary/50 border border-border/60 rounded-lg px-3 py-2 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="last_used">Recently used</option>
            <option value="importance">Importance</option>
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border ${showArchived ? "bg-gold/10 border-gold/40 text-gold" : "bg-secondary/50 border-border/60 text-muted-foreground"}`}
          >
            <Filter size={12} className="inline mr-1" />
            {showArchived ? "Archived" : "Active"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCreating(true)}
            className="bg-gradient-blood text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 shadow-blood"
          >
            <Plus size={14} /> New memory
          </button>
          <button
            onClick={handleImport}
            className="border border-border/60 hover:border-gold/40 px-3 py-2 rounded-lg text-xs inline-flex items-center gap-1.5"
          >
            <Upload size={12} /> Import
          </button>
          <button
            onClick={handleExport}
            className="border border-border/60 hover:border-gold/40 px-3 py-2 rounded-lg text-xs inline-flex items-center gap-1.5"
          >
            <Download size={12} /> Export
          </button>
          <button
            onClick={handleClearAll}
            className="ml-auto text-destructive hover:underline text-xs inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear all
          </button>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      ) : memories.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} archived={showArchived} />
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([cat, items]) => (
            <section key={cat}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold mb-2">
                <span>{MEMORY_CATEGORIES.find((c) => c.value === cat)?.emoji}</span>
                {CATEGORY_LABEL[cat]}{" "}
                <span className="text-muted-foreground font-normal">({items.length})</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {items.map((m) => (
                  <MemoryCard
                    key={m.id}
                    m={m}
                    onEdit={() => setEditing(m)}
                    onPin={() => handlePin(m)}
                    onArchive={() => handleArchive(m)}
                    onDelete={() => handleDelete(m)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <MemoryEditor
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function StatMini({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: "gold";
}) {
  return (
    <div
      className={`bg-card border rounded-xl p-3 ${accent === "gold" ? "border-gold/40" : "border-border/60"}`}
    >
      <div
        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold mb-1 ${accent === "gold" ? "text-gold" : "text-muted-foreground"}`}
      >
        {icon} {label}
      </div>
      <div className="display text-2xl">{value}</div>
    </div>
  );
}

function EmptyState({ onCreate, archived }: { onCreate: () => void; archived: boolean }) {
  return (
    <div className="bg-card border border-dashed border-border/60 rounded-2xl p-10 text-center">
      <Brain className="mx-auto mb-3 text-muted-foreground" size={32} />
      <div className="font-bold mb-1">{archived ? "Nothing archived" : "No memories yet"}</div>
      <p className="text-sm text-muted-foreground mb-4">
        {archived
          ? "Archived items will show up here."
          : "Add goals, strengths, and preferences so your coaches personalize every reply."}
      </p>
      {!archived && (
        <button
          onClick={onCreate}
          className="bg-gradient-blood text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm shadow-blood inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Add first memory
        </button>
      )}
    </div>
  );
}

function MemoryCard({
  m,
  onEdit,
  onPin,
  onArchive,
  onDelete,
}: {
  m: Memory;
  onEdit: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-card border rounded-xl p-4 transition ${m.pinned ? "border-gold/50 shadow-[0_0_0_1px_color-mix(in_oklab,var(--gold)_15%,transparent)]" : "border-border/60 hover:border-gold/30"}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="font-semibold text-sm truncate">{m.title}</div>
            {m.pinned && <Pin size={12} className="text-gold shrink-0" />}
            <div className="ml-auto flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full ${i < m.importance ? "bg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
            {m.content}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/50">
        <IconBtn onClick={onEdit} title="Edit">
          <Edit3 size={13} />
        </IconBtn>
        <IconBtn onClick={onPin} title={m.pinned ? "Unpin" : "Pin"}>
          {m.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </IconBtn>
        <IconBtn onClick={onArchive} title={m.archived ? "Restore" : "Archive"}>
          {m.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        </IconBtn>
        <IconBtn onClick={onDelete} title="Delete" danger>
          <Trash2 size={13} />
        </IconBtn>
        <div className="ml-auto text-[10px] text-muted-foreground">
          {m.source !== "manual" && <span className="mr-2">{m.source}</span>}
          {new Date(m.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`h-7 w-7 rounded-md flex items-center justify-center transition ${danger ? "hover:bg-destructive/15 hover:text-destructive" : "hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function MemoryEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Memory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState<MemoryCategory>(initial?.category ?? "general");
  const [importance, setImportance] = useState<number>(initial?.importance ?? 3);
  const [pinned, setPinned] = useState<boolean>(initial?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content required");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateMemory(initial.id, { title, content, category, importance, pinned });
        toast.success("Updated");
      } else {
        await createMemory({ title, content, category, importance, pinned });
        toast.success("Memory saved");
      }
      onSaved();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-gold/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-gold uppercase tracking-widest font-bold">
              {initial ? "Edit memory" : "New memory"}
            </div>
            <div className="display text-2xl">Fuel the coach</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Title
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Primary goal"
              className="w-full bg-secondary/50 border border-border/60 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Content
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Be specific. Raw honesty = sharper coaching."
              className="w-full bg-secondary/50 border border-border/60 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Category
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryCategory)}
                className="w-full bg-secondary/50 border border-border/60 rounded-lg px-3 py-2 text-sm"
              >
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Importance
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setImportance(n)}
                    className={`h-8 flex-1 rounded-md border text-xs font-bold transition ${n <= importance ? "bg-gradient-blood text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/40"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-primary"
            />
            <Pin size={14} className={pinned ? "text-gold" : "text-muted-foreground"} />
            Pin this memory (always shown to the coach)
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-border/60 hover:bg-secondary py-2.5 rounded-lg text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-gradient-blood text-primary-foreground font-bold py-2.5 rounded-lg shadow-blood inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save memory"}
          </button>
        </div>
      </div>
    </div>
  );
}
