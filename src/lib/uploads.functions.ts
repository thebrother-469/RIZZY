import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_LIMITS_MB: Record<string, Record<string, number>> = {
  free: { image: 100, video: 100, document: 100 },
  pro: { image: 500, video: 500, document: 500 },
  elite: { image: 1024, video: 1024, document: 1024 },
};

const InputSchema = z.object({
  size: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024 * 1024),
  kind: z.enum(["image", "video", "document"]),
  ext: z.string().regex(/^[a-z0-9]{1,8}$/i),
});

export const authorizeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    const plan = (sub?.plan as "free" | "pro" | "elite") ?? "free";
    const limitMb = PLAN_LIMITS_MB[plan]?.[data.kind] ?? PLAN_LIMITS_MB.free[data.kind];
    if (data.size > limitMb * 1024 * 1024) {
      throw new Error(`File exceeds your ${plan} plan limit of ${limitMb}MB.`);
    }
    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${data.ext.toLowerCase()}`;
    const { data: signed, error } = await supabase.storage
      .from("uploads")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Failed to authorize upload.");
    return { path: signed.path, token: signed.token };
  });
