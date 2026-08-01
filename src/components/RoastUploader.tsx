import { useRef, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  Flame,
  Eye,
} from "lucide-react";
import { uploadAttachment } from "@/lib/attachments";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export type RoastShot = { id: string; url: string; name: string };

export function RoastUploader({
  onConfirm,
}: {
  onConfirm: (payload: {
    shots: RoastShot[];
    context: string;
    goal: string;
    prompt: string;
  }) => void;
}) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [shots, setShots] = useState<RoastShot[]>([]);
  const [context, setContext] = useState("");
  const [goal, setGoal] = useState<string>("Get the date");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) {
      toast.error("Drop image files only (PNG/JPG screenshots).");
      return;
    }
    if (shots.length + arr.length > 6) {
      toast.error("Max 6 screenshots per roast, bro.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        arr.map(async (f) => {
          const { url } = await uploadAttachment(f);
          return { id: crypto.randomUUID(), url, name: f.name };
        }),
      );
      setShots((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} screenshot${uploaded.length > 1 ? "s" : ""} loaded.`);
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, "Upload failed. Try again."));
    } finally {
      setUploading(false);
    }
  };

  const remove = (id: string) => setShots((prev) => prev.filter((s) => s.id !== id));

  const goToReview = () => {
    if (shots.length === 0) {
      toast.error("Drop at least one screenshot first.");
      return;
    }
    setStep("review");
  };

  const submit = () => {
    const prompt = [
      `Roast this conversation. Goal: ${goal}.`,
      context.trim() ? `Context the user gave you: ${context.trim()}` : "",
      `${shots.length} screenshot${shots.length > 1 ? "s" : ""} attached in order.`,
      "Break down: what worked, what was simping, what energy is being projected, the exact rewrite, and the next move to send right now.",
    ]
      .filter(Boolean)
      .join("\n\n");
    onConfirm({ shots, context, goal, prompt });
  };

  const GOALS = [
    "Get the date",
    "Restart a dead chat",
    "Build attraction",
    "Recover from a fumble",
    "Get her number",
  ];

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 text-xs uppercase tracking-widest font-bold">
        <span className={step === "upload" ? "text-gold" : "text-muted-foreground"}>1. Upload</span>
        <span className="text-border">—</span>
        <span className={step === "review" ? "text-gold" : "text-muted-foreground"}>2. Review</span>
        <span className="text-border">—</span>
        <span className="text-muted-foreground">3. Roast</span>
      </div>

      {step === "upload" && (
        <>
          <h2 className="display text-3xl md:text-4xl mb-2">
            Drop the <span className="text-gradient-blood">evidence</span>.
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Tinder, Bumble, Hinge, IG DMs, WhatsApp — paste up to 6 screenshots. I'll read every
            line and roast it raw.
          </p>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-gold/60 bg-card/40"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-blood text-primary-foreground flex items-center justify-center mb-3 shadow-blood">
              {uploading ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
            </div>
            <div className="display text-xl mb-1">
              {uploading ? "Loading screenshots..." : "Tap or drop screenshots here"}
            </div>
            <div className="text-xs text-muted-foreground">PNG · JPG · up to 6 images</div>
          </div>

          {/* Uploaded preview row */}
          {shots.length > 0 && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
                {shots.length} loaded
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {shots.map((s) => (
                  <div
                    key={s.id}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-border/60 bg-card"
                  >
                    <img
                      src={s.url}
                      alt="Conversation screenshot"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(s.id);
                      }}
                      aria-label="Remove screenshot"
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={goToReview}
              disabled={shots.length === 0 || uploading}
              className="bg-gradient-blood text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-blood disabled:opacity-40 inline-flex items-center gap-2"
            >
              Review before roast <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <h2 className="display text-3xl md:text-4xl mb-2">
            Last look <span className="text-gradient-gold">before I cook</span>.
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Make sure the screenshots are in order and add context so the roast hits harder.
          </p>

          {/* Screenshots in order */}
          <div className="bg-card border border-border/60 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-widest font-bold text-gold flex items-center gap-1.5">
                <ImageIcon size={14} /> Screenshots ({shots.length})
              </div>
              <button
                onClick={() => setStep("upload")}
                className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Edit
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shots.map((s, i) => (
                <div
                  key={s.id}
                  className="relative group rounded-lg overflow-hidden border border-border/60 bg-background"
                >
                  <img
                    src={s.url}
                    alt="Conversation screenshot"
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute top-1 left-1 h-6 w-6 rounded-full bg-gradient-blood text-primary-foreground text-xs font-bold flex items-center justify-center shadow-blood">
                    {i + 1}
                  </div>
                  <button
                    onClick={() => setZoomed(s.url)}
                    className="absolute bottom-1 left-1 h-7 px-2 rounded-md bg-background/90 border border-border text-xs inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Eye size={12} /> Zoom
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    aria-label="Remove screenshot"
                    className="absolute top-1 right-1 h-7 w-7 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div className="bg-card border border-border/60 rounded-2xl p-4 mb-4">
            <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
              Your goal
            </label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    goal === g
                      ? "bg-gradient-blood text-primary-foreground border-transparent shadow-blood"
                      : "border-border/60 text-muted-foreground hover:border-gold/60"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Context */}
          <div className="bg-card border border-border/60 rounded-2xl p-4 mb-6">
            <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
              Context (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Where you met her, how long it's been, anything I should know..."
              className="w-full resize-none bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">
              {context.length}/500
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3">
            <button
              onClick={() => setStep("upload")}
              className="px-5 py-3 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground hover:border-gold/60 inline-flex items-center justify-center gap-2 font-semibold"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={submit}
              className="bg-gradient-blood text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-blood inline-flex items-center justify-center gap-2"
            >
              <Flame size={18} /> Roast it now
            </button>
          </div>
        </>
      )}

      {/* Zoom modal */}
      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomed}
            alt="Enlarged screenshot preview"
            className="max-h-full max-w-full rounded-lg shadow-card"
          />
        </div>
      )}
    </div>
  );
}
