import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Paperclip,
  Camera,
  Image as ImageIcon,
  X,
  Loader2,
  Send,
  AlertCircle,
  RotateCw,
  GripVertical,
  Smile,
  FileText,
  Film,
  WifiOff,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Attachment,
  ACCEPTED_ATTR,
  MAX_FILES,
  isAiSupported,
  uploadAttachment,
  validate,
  humanSize,
  type PlanTier,
} from "@/lib/attachments";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  disabled?: boolean;
  streaming?: boolean;
  placeholder?: string;
  onSend: (text: string, imageUrls: string[]) => void;
  autoFocus?: boolean;
  /** Unique key for draft autosave. Defaults to route pathname. */
  draftKey?: string;
  /** Optional soft character counter. */
  maxLength?: number;
};

const EMOJI = [
  "😀",
  "😂",
  "😍",
  "😎",
  "🥲",
  "🥺",
  "😳",
  "🤔",
  "😏",
  "😤",
  "🔥",
  "💀",
  "💯",
  "👀",
  "👑",
  "❤️",
  "💔",
  "💘",
  "✨",
  "🌹",
  "🍷",
  "🥂",
  "😈",
  "😇",
  "🤝",
  "💪",
  "🤌",
  "🙌",
  "👋",
  "🫶",
];

/** Universal chat composer: reusable across every AI chat surface. */
export function ChatComposer({
  disabled,
  streaming,
  placeholder,
  onSend,
  autoFocus,
  draftKey,
  maxLength,
}: Props) {
  const scopeKey = `chat-draft:${draftKey || (typeof window !== "undefined" ? window.location.pathname : "default")}`;

  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(scopeKey) || "";
    } catch {
      return "";
    }
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<PlanTier>("free");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.plan) {
        const p = String(data.plan).toLowerCase();
        if (p === "pro" || p === "elite" || p === "free") setPlan(p as PlanTier);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragItem = useRef<string | null>(null);
  /** Keep original File + abort controller for retries and cancellation. */
  const filesRef = useRef<Map<string, { file: File; controller: AbortController }>>(new Map());

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Auto-grow
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  // Draft autosave
  useEffect(() => {
    try {
      if (text) localStorage.setItem(scopeKey, text);
      else localStorage.removeItem(scopeKey);
    } catch {
      /* quota / private mode */
    }
  }, [text, scopeKey]);

  // Online / offline detection
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => {
      setOnline(false);
      toast.warning("You're offline. Uploads will resume when reconnected.");
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Cleanup on unmount: abort any in-flight uploads and revoke object URLs.
  // Prevents orphaned network requests and object-URL memory leaks on
  // rapid route switches while uploads are in progress.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    return () => {
      filesRef.current.forEach(({ controller }) => controller.abort());
      filesRef.current.clear();
      attachmentsRef.current.forEach((a) => {
        if (a.localPreview) URL.revokeObjectURL(a.localPreview);
      });
    };
  }, []);

  const doUpload = useCallback(async (id: string, file: File) => {
    const controller = new AbortController();
    filesRef.current.set(id, { file, controller });
    try {
      const { url } = await uploadAttachment(
        file,
        (pct) =>
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, progress: pct } : a))),
        controller.signal,
      );
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, url, progress: 100, status: "done" } : a)),
      );
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "canceled" } : a)));
        return;
      }
      console.error("upload failed", e);
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "error", error: err?.message || "Upload failed" } : a,
        ),
      );
      toast.error(`Upload failed: ${file.name}`);
    }
  }, []);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list);
      if (files.length === 0) return;
      const remaining = MAX_FILES - attachments.length;
      if (remaining <= 0) {
        toast.error(`Max ${MAX_FILES} attachments.`);
        return;
      }

      const take = files.slice(0, remaining);
      if (files.length > remaining) {
        toast.warning(`Added ${remaining} of ${files.length} — max ${MAX_FILES}.`);
      }

      const created: Attachment[] = [];
      for (const f of take) {
        const v = validate(f, plan);
        if (!v.ok) {
          toast.error(v.error);
          continue;
        }
        const id = crypto.randomUUID();
        const localPreview =
          v.kind === "image" || v.kind === "video" ? URL.createObjectURL(f) : undefined;
        created.push({
          id,
          name: f.name,
          size: f.size,
          mime: f.type,
          kind: v.kind,
          url: "",
          progress: 0,
          status: "uploading",
          localPreview,
          aiSupported: isAiSupported(v.kind),
        });
        void doUpload(id, f);
      }
      if (created.length) {
        setAttachments((prev) => [...prev, ...created]);
        const nonAi = created.filter((a) => !a.aiSupported);
        if (nonAi.length) {
          toast.info(
            `${nonAi.length} file${nonAi.length > 1 ? "s" : ""} attached. AI analysis for ${nonAi[0].kind}s is coming soon — they'll upload but won't be read yet.`,
          );
        }
      }
    },
    [attachments.length, doUpload, plan],
  );

  const retry = (id: string) => {
    const entry = filesRef.current.get(id);
    if (!entry) {
      toast.info("Re-select the file to retry.");
      return;
    }
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "uploading", progress: 0, error: undefined } : a,
      ),
    );
    void doUpload(id, entry.file);
  };

  const remove = (id: string) => {
    const entry = filesRef.current.get(id);
    entry?.controller.abort();
    filesRef.current.delete(id);
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone?.localPreview) URL.revokeObjectURL(gone.localPreview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const onDragStart = (id: string) => {
    dragItem.current = id;
  };
  const onDragOverItem = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const from = dragItem.current;
    if (!from || from === overId) return;
    setAttachments((prev) => {
      const a = [...prev];
      const fi = a.findIndex((x) => x.id === from);
      const ti = a.findIndex((x) => x.id === overId);
      if (fi < 0 || ti < 0) return prev;
      const [item] = a.splice(fi, 1);
      a.splice(ti, 0, item);
      return a;
    });
  };

  // Clipboard paste — supports multiple files
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setText((t) => t + emoji);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (streaming || disabled) return;
    const anyUploading = attachments.some((a) => a.status === "uploading");
    if (anyUploading) {
      toast.info("Hold up — attachments still uploading.");
      return;
    }
    // Only image URLs go to the AI; videos/docs remain visible in UI but aren't sent.
    const urls = attachments
      .filter((a) => a.status === "done" && a.url && a.aiSupported)
      .map((a) => a.url);
    if (!text.trim() && urls.length === 0) return;
    onSend(text.trim() || (urls.length ? "Roast this." : ""), urls);
    attachments.forEach((a) => a.localPreview && URL.revokeObjectURL(a.localPreview));
    filesRef.current.clear();
    setAttachments([]);
    setText("");
    try {
      localStorage.removeItem(scopeKey);
    } catch {
      /* noop */
    }
  };

  const anyUploading = attachments.some((a) => a.status === "uploading");
  const canSend = useMemo(
    () =>
      !streaming &&
      !disabled &&
      !anyUploading &&
      (text.trim().length > 0 || attachments.some((a) => a.status === "done" && a.aiSupported)),
    [streaming, disabled, anyUploading, text, attachments],
  );

  const overLimit = maxLength ? text.length > maxLength : false;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`relative border-t border-border/60 bg-background/80 backdrop-blur px-3 md:px-8 py-3 md:py-4 transition ${dragOver ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-card/90 border border-gold/60 rounded-xl px-4 py-2 text-sm font-semibold text-gold">
            Drop to attach
          </div>
        </div>
      )}

      {!online && (
        <div className="mb-2 flex items-center gap-2 text-xs text-destructive-foreground bg-destructive/80 rounded-lg px-3 py-1.5">
          <WifiOff size={14} /> Offline — messages send once you're back on.
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_ATTR}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Preview strip */}
      {attachments.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Attachments">
          {attachments.map((a) => (
            <div
              key={a.id}
              role="listitem"
              draggable
              onDragStart={() => onDragStart(a.id)}
              onDragOver={(e) => onDragOverItem(e, a.id)}
              className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border/60 bg-card group"
              title={`${a.name} · ${humanSize(a.size)}${!a.aiSupported ? " · AI not yet available" : ""}`}
            >
              {a.kind === "image" && (a.localPreview || a.url) ? (
                <>
                  <img
                    src={a.localPreview || a.url}
                    alt="Chat attachment"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <button
                    onClick={() => setPreview(a)}
                    aria-label="Preview attachment"
                    className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition opacity-0 hover:opacity-100"
                  >
                    <Maximize2 size={16} className="text-white" />
                  </button>
                </>
              ) : a.kind === "video" && a.localPreview ? (
                <>
                  <video
                    src={a.localPreview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-1 px-1 py-0.5 text-[10px] text-white font-medium">
                    <Film size={10} /> Video
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 text-center">
                  <FileText size={20} className="text-gold" />
                  <span className="text-[10px] text-muted-foreground break-all leading-tight line-clamp-2">
                    {a.name.slice(0, 20)}
                  </span>
                </div>
              )}

              {a.status === "uploading" && (
                <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-1">
                  <Loader2 size={16} className="animate-spin text-gold" />
                  <div className="w-14 h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-blood transition-all"
                      style={{ width: `${a.progress}%` }}
                    />
                  </div>
                </div>
              )}
              {a.status === "error" && (
                <button
                  onClick={() => retry(a.id)}
                  className="absolute inset-0 bg-destructive/85 text-destructive-foreground flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold"
                  title={a.error}
                  aria-label="Retry upload"
                >
                  <AlertCircle size={14} />
                  <span className="inline-flex items-center gap-1">
                    <RotateCw size={10} /> retry
                  </span>
                </button>
              )}
              {a.status === "canceled" && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center text-[10px] text-muted-foreground">
                  canceled
                </div>
              )}
              {a.status === "done" && !a.aiSupported && (
                <div className="absolute top-0.5 left-0.5 bg-gold/90 text-background text-[9px] font-bold px-1 rounded">
                  UPLOAD
                </div>
              )}
              <button
                onClick={() => remove(a.id)}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-90 hover:opacity-100"
                aria-label="Remove attachment"
              >
                <X size={11} />
              </button>
              <div className="absolute bottom-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition text-muted-foreground bg-background/80 rounded p-0.5">
                <GripVertical size={10} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Attachment menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowMenu((v) => !v);
              setShowEmoji(false);
            }}
            onBlur={() => setTimeout(() => setShowMenu(false), 150)}
            disabled={disabled}
            className="h-11 w-11 shrink-0 rounded-xl border border-border/60 bg-card hover:border-gold/60 flex items-center justify-center text-gold transition"
            aria-label="Add attachment"
            aria-expanded={showMenu}
            title="Attach files"
          >
            <Paperclip size={18} />
          </button>
          {showMenu && (
            <div className="absolute bottom-12 left-0 z-20 w-56 bg-card border border-border/60 rounded-xl shadow-card p-1 animate-in fade-in slide-in-from-bottom-2">
              <MenuItem
                icon={<ImageIcon size={16} />}
                label="Photos, videos & files"
                onClick={() => fileRef.current?.click()}
              />
              <MenuItem
                icon={<ImageIcon size={16} />}
                label="Photo library"
                onClick={() => galleryRef.current?.click()}
              />
              <MenuItem
                icon={<Camera size={16} />}
                label="Take photo"
                onClick={() => cameraRef.current?.click()}
              />
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/60 mt-1">
                Tip: paste (⌘V) or drag & drop
              </div>
            </div>
          )}
        </div>

        {/* Emoji */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => {
              setShowEmoji((v) => !v);
              setShowMenu(false);
            }}
            onBlur={() => setTimeout(() => setShowEmoji(false), 180)}
            disabled={disabled}
            className="h-11 w-11 shrink-0 rounded-xl border border-border/60 bg-card hover:border-gold/60 flex items-center justify-center text-gold transition"
            aria-label="Insert emoji"
            aria-expanded={showEmoji}
            title="Emoji"
          >
            <Smile size={18} />
          </button>
          {showEmoji && (
            <div className="absolute bottom-12 left-0 z-20 w-64 bg-card border border-border/60 rounded-xl shadow-card p-2 grid grid-cols-8 gap-1 animate-in fade-in slide-in-from-bottom-2">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    insertEmoji(e);
                  }}
                  className="h-7 w-7 rounded hover:bg-secondary/60 text-lg leading-none"
                  aria-label={`Insert ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setShowEmoji(false);
                setShowMenu(false);
              }
            }}
            rows={1}
            onFocus={() => {
              // Keyboard-aware: once the viewport has settled, pull the
              // composer fully into view on mobile browsers that pan rather
              // than resize the layout viewport.
              const el = textareaRef.current;
              if (!el) return;
              window.setTimeout(
                () => el.scrollIntoView({ block: "nearest", behavior: "smooth" }),
                250,
              );
            }}
            aria-label="Message"
            placeholder={placeholder || "Type your line, attach a screenshot, or ask anything..."}
            className={`w-full resize-none bg-card border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 max-h-[200px] ${overLimit ? "border-destructive" : "border-border/60"}`}
          />
          {maxLength && text.length > maxLength * 0.8 && (
            <div
              className={`absolute -top-5 right-1 text-[10px] font-medium ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {text.length}/{maxLength}
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={!canSend || overLimit}
          className="h-11 w-11 sm:w-auto sm:px-4 shrink-0 rounded-xl bg-gradient-blood text-primary-foreground font-semibold shadow-blood disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-transform active:scale-95 hover:brightness-110"
          aria-label={streaming ? "Waiting for reply" : "Send message"}
          title="Send (Enter)"
        >
          {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          <span className="hidden sm:inline">{streaming ? "Sending" : "Send"}</span>
        </button>
      </div>

      {/* Fullscreen preview */}
      {preview && preview.kind === "image" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center p-4 animate-in fade-in"
        >
          <img
            src={preview.localPreview || preview.url}
            alt="Attachment preview"
            className="max-w-full max-h-full rounded-xl border border-gold/40 shadow-2xl object-contain"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
            }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:border-gold/60"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary/60 text-left"
    >
      <span className="text-gold">{icon}</span>
      {label}
    </button>
  );
}
