/**
 * Centralized runtime environment validation.
 *
 * Runs at server startup (invoked from `src/server.ts`) and can be invoked
 * ad-hoc via `scripts/validate-env.ts`. It fails fast with a readable,
 * secret-safe error listing exactly which variables are missing or invalid.
 *
 * Never logs secret VALUES — only variable NAMES and their validation state.
 */
import { z } from "zod";
import { validateAiKeyValue } from "./ai-key";

/** Optional AI keys must either be absent or well-formed — never a placeholder. */
const aiKeySchema = z
  .string()
  .superRefine((value, ctx) => {
    const reason = validateAiKeyValue(value);
    if (reason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: reason });
  })
  .optional();

const urlSchema = z.string().url();
const uuidishSchema = z.string().regex(/^[A-Za-z0-9_-]{6,}$/);
const nonEmpty = z.string().min(1);

/** Required in ALL environments (client + server). */
const clientRequired = {
  VITE_SUPABASE_URL: urlSchema,
  VITE_SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  VITE_SUPABASE_PROJECT_ID: uuidishSchema,
} as const;

/** Required only on the server. */
const serverRequired = {
  SUPABASE_URL: urlSchema,
  SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
} as const;

/** Optional but validated if present. */
const optional = {
  HEALTH_CHECK_SECRET: nonEmpty.optional(),
  LEMON_SYNC_CRON_SECRET: nonEmpty.optional(),
  LEMONSQUEEZY_API_KEY: nonEmpty.optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: nonEmpty.optional(),
  LEMONSQUEEZY_STORE_ID: nonEmpty.optional(),
  LEMONSQUEEZY_PRO_VARIANT_ID: nonEmpty.optional(),
  LEMONSQUEEZY_ELITE_VARIANT_ID: nonEmpty.optional(),
  LOVABLE_API_KEY: aiKeySchema,
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
} as const;

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  invalid: Array<{ name: string; reason: string }>;
  presentOptional: string[];
}

function checkSchema(
  entries: Record<string, z.ZodTypeAny>,
  source: Record<string, string | undefined>,
  required: boolean,
  result: EnvValidationResult,
) {
  for (const [name, schema] of Object.entries(entries)) {
    const raw = source[name];
    if (raw === undefined || raw === "") {
      if (required) result.missing.push(name);
      continue;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      result.invalid.push({
        name,
        reason: parsed.error.issues.map((i) => i.message).join("; "),
      });
    } else if (!required) {
      result.presentOptional.push(name);
    }
  }
}

/**
 * Validate the runtime environment. Pure — safe for tests to call with a
 * seeded env dictionary. When `env` is omitted, reads from `process.env`
 * (server) and merges known `import.meta.env` VITE_* values when available.
 */
export function validateEnv(
  env: Record<string, string | undefined> = readEnv(),
  opts: { context?: "server" | "client" } = {},
): EnvValidationResult {
  const result: EnvValidationResult = {
    ok: true,
    missing: [],
    invalid: [],
    presentOptional: [],
  };
  const ctx = opts.context ?? "server";
  checkSchema(clientRequired, env, true, result);
  if (ctx === "server") checkSchema(serverRequired, env, true, result);
  checkSchema(optional, env, false, result);
  result.ok = result.missing.length === 0 && result.invalid.length === 0;
  return result;
}

function readEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (typeof process !== "undefined" && process.env) {
    for (const [k, v] of Object.entries(process.env)) out[k] = v;
  }
  return out;
}

/** Assert-and-throw variant used by server startup. Never logs values. */
export function assertEnvOrThrow(env?: Record<string, string | undefined>): void {
  const r = validateEnv(env);
  if (r.ok) return;
  const lines = [
    "[env-validation] FAILED — refusing to start.",
    r.missing.length ? `  missing: ${r.missing.join(", ")}` : "",
    r.invalid.length
      ? `  invalid: ${r.invalid.map((i) => `${i.name} (${i.reason})`).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  throw new Error(lines);
}
