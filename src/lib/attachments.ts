import { supabase } from "@/integrations/supabase/client";

export type AttachmentKind = "image" | "video" | "document";

export type Attachment = {
  id: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  kind: AttachmentKind;
  progress: number; // 0-100
  status: "uploading" | "done" | "error" | "canceled";
  error?: string;
  localPreview?: string; // object URL for images/videos
  /** True when uploaded but not sent to AI (e.g. videos/docs — AI can't read yet). */
  aiSupported: boolean;
};

export const MAX_FILES = 8;

export type PlanTier = "free" | "pro" | "elite";

/** Per-plan upload ceilings (MB). Adaptive client-side compression still applies to images. */
export const PLAN_LIMITS_MB: Record<PlanTier, Record<AttachmentKind, number>> = {
  free: { image: 100, video: 100, document: 100 },
  pro: { image: 500, video: 500, document: 500 },
  elite: { image: 1024, video: 1024, document: 1024 },
};

/** Legacy export kept for backwards-compat with any code that reads MAX_SIZE_MB directly. */
export const MAX_SIZE_MB = PLAN_LIMITS_MB.free;

export function getLimitMb(kind: AttachmentKind, plan: PlanTier = "free"): number {
  return PLAN_LIMITS_MB[plan]?.[kind] ?? PLAN_LIMITS_MB.free[kind];
}

export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"];
export const VIDEO_EXT = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];
export const DOC_EXT = ["pdf", "txt", "docx"];

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  "video/x-m4v",
]);
const DOC_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ACCEPTED_ATTR = [
  "image/*",
  "video/*",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ...IMAGE_EXT.map((e) => "." + e),
  ...VIDEO_EXT.map((e) => "." + e),
  ...DOC_EXT.map((e) => "." + e),
].join(",");

export function classify(mime: string, name: string): AttachmentKind | null {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (IMAGE_MIMES.has(m) || m.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_MIMES.has(m) || m.startsWith("video/") || VIDEO_EXT.includes(ext)) return "video";
  if (DOC_MIMES.has(m) || DOC_EXT.includes(ext)) return "document";
  return null;
}

/** AI-capable modalities today. Extend when new models land. */
export function isAiSupported(kind: AttachmentKind): boolean {
  return kind === "image";
}

export function validate(
  file: File,
  plan: PlanTier = "free",
): { ok: true; kind: AttachmentKind } | { ok: false; error: string } {
  const kind = classify(file.type, file.name);
  if (!kind) return { ok: false, error: `Unsupported file type: ${file.name}` };
  const limit = getLimitMb(kind, plan);
  if (file.size > limit * 1024 * 1024) {
    return { ok: false, error: `${file.name} is over ${limit}MB.` };
  }
  return { ok: true, kind };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Downscale large images client-side to keep uploads snappy and cheap. Passes through non-images. */
export async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) return file;
  if (file.type === "image/gif") return file; // preserve animation
  if (file.size < 500_000) return file; // <500KB, skip
  try {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    // Larger images get more aggressive downscaling to keep uploads snappy
    const MAX = file.size > 8_000_000 ? 1920 : 2560;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const quality = file.size > 8_000_000 ? 0.8 : 0.86;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadAttachment(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ url: string; path: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload.");
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");

  const prepped = await maybeCompressImage(file);
  const ext = (prepped.name.split(".").pop() || "bin").toLowerCase();
  const kind = classify(prepped.type, prepped.name) ?? "document";

  onProgress?.(5);
  // Server authorizes upload against the user's plan size limit and mints a
  // one-shot signed upload URL. This is the source of truth for plan limits —
  // the client-side validate() is UX only.
  const { authorizeUpload } = await import("@/lib/uploads.functions");
  const { path, token } = await authorizeUpload({
    data: { size: prepped.size, kind, ext },
  });
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");

  onProgress?.(10);
  const ticker = setInterval(() => onProgress?.(Math.min(85, 10 + Math.random() * 75)), 350);
  const abortHandler = () => clearInterval(ticker);
  signal?.addEventListener("abort", abortHandler);

  try {
    const { error } = await supabase.storage
      .from("uploads")
      .uploadToSignedUrl(path, token, prepped, {
        upsert: false,
        contentType: prepped.type || undefined,
      });
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
    if (error) throw error;
    onProgress?.(95);
    const { data: signed, error: signErr } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 60 * 60);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Failed to sign URL");
    onProgress?.(100);
    return { url: signed.signedUrl, path };
  } finally {
    clearInterval(ticker);
    signal?.removeEventListener("abort", abortHandler);
  }
}

/**
 * Extract the storage path (e.g. `{user_id}/{uuid}.webp`) from an uploads
 * signed URL. Returns null when the URL isn't recognizable as one of ours.
 */
export function pathFromSignedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public)\/uploads\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Re-sign a stored uploads URL for `ttlSeconds`. Falls back to the original
 * URL when the path can't be recovered (e.g. legacy external URLs).
 */
export async function refreshSignedUrl(url: string, ttlSeconds = 60 * 60): Promise<string> {
  const path = pathFromSignedUrl(url);
  if (!path) return url;
  const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}
