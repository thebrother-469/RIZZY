import { describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env-validation";

const goodClient = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "pk_test_abc123",
  VITE_SUPABASE_PROJECT_ID: "abc123def456",
};
const goodServer = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk_test_abc123",
  SUPABASE_SERVICE_ROLE_KEY: "sk_test_xyz789",
};

describe("validateEnv", () => {
  it("passes when all required present", () => {
    const r = validateEnv({ ...goodClient, ...goodServer });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("reports missing required by name", () => {
    const r = validateEnv({ ...goodClient });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("rejects invalid URL", () => {
    const r = validateEnv({ ...goodClient, ...goodServer, VITE_SUPABASE_URL: "not-a-url" });
    expect(r.ok).toBe(false);
    expect(r.invalid.find((i) => i.name === "VITE_SUPABASE_URL")).toBeTruthy();
  });
  it("never surfaces secret values", () => {
    const r = validateEnv({ ...goodClient, SUPABASE_SERVICE_ROLE_KEY: "sk_secret_xxx" });
    const s = JSON.stringify(r);
    expect(s).not.toContain("sk_secret_xxx");
  });
});
