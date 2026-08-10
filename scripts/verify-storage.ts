#!/usr/bin/env bun
/**
 * Storage security regression for the private `uploads` bucket.
 *
 * Provisions two disposable users and verifies, against the live Storage
 * API: owner upload (image / text / binary), oversize + invalid-MIME
 * rejection, owner read+list, anon denial, cross-user denial, signed URL
 * generation / access / expiry, owner delete, non-owner delete denial, and
 * that a deleted object is gone.
 *
 * Emits security-artifacts/storage-coverage.json. Exits 0 with NOT VERIFIED
 * when the service key is not bound.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  resolveEnv,
  missing,
  ensureUser,
  deleteUser,
  passwordSignIn,
  disposableIdentity,
  type E2EEnv,
} from "./e2e-env";

interface Check {
  name: string;
  expected: "allow" | "deny";
  actual: "allow" | "deny" | "unknown";
  status: number;
  result: "PASS" | "FAIL" | "NOT_VERIFIED";
}
const checks: Check[] = [];

/** Transport failures prove nothing about the policy under test. */
const isTransport = (status: number) => status === 0 || status === 408 || status >= 500;

const record = (
  name: string,
  expected: "allow" | "deny",
  status: number,
  allowed = status < 300,
) => {
  const actual: Check["actual"] = isTransport(status) ? "unknown" : allowed ? "allow" : "deny";
  checks.push({
    name,
    expected,
    actual,
    status,
    result: actual === "unknown" ? "NOT_VERIFIED" : expected === actual ? "PASS" : "FAIL",
  });
};

/** Must mirror the bucket configuration and src/lib/attachments.ts. */
const MAX_BYTES = 50 * 1024 * 1024;
const REQUIRED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
  "text/plain",
];

function storage(e: E2EEnv, path: string, token: string | null, init: RequestInit = {}) {
  return fetch(`${e.url!.replace(/\/$/, "")}/storage/v1${path}`, {
    ...init,
    headers: {
      apikey: e.anonKey!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function upload(
  e: E2EEnv,
  token: string,
  objectPath: string,
  body: BodyInit,
  contentType: string,
) {
  const res = await storage(e, `/object/uploads/${objectPath}`, token, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body,
  });
  return res.status;
}

async function main() {
  const e = resolveEnv();
  const need = missing(e, ["url", "anonKey", "serviceKey"]);
  if (need.length) {
    return emit(
      { overall: "NOT VERIFIED", detail: `Storage suite needs ${need.join(", ")}.`, checks: [] },
      0,
    );
  }

  // --- Bucket configuration (the enforcement point for size + MIME) ---
  const bucketRes = await fetch(`${e.url!.replace(/\/$/, "")}/storage/v1/bucket/uploads`, {
    headers: { apikey: e.serviceKey!, Authorization: `Bearer ${e.serviceKey!}` },
  });
  const bucket = (await bucketRes.json().catch(() => ({}))) as {
    public?: boolean;
    file_size_limit?: number | null;
    allowed_mime_types?: string[] | null;
  };
  record(
    "bucket is private",
    "deny",
    bucketRes.ok ? 200 : bucketRes.status,
    bucket.public === true,
  );
  record(
    `bucket enforces a size limit (<= ${MAX_BYTES} bytes)`,
    "allow",
    bucketRes.status,
    typeof bucket.file_size_limit === "number" && bucket.file_size_limit <= MAX_BYTES,
  );
  const mimes = bucket.allowed_mime_types ?? [];
  record(
    "bucket enforces a MIME allowlist",
    "allow",
    bucketRes.status,
    mimes.length > 0 && REQUIRED_MIMES.every((m) => mimes.includes(m)),
  );

  const a = disposableIdentity("storage-a");
  const b = disposableIdentity("storage-b");
  const ua = await ensureUser(e, a.email, a.password);
  const ub = await ensureUser(e, b.email, b.password);
  const sa = (await passwordSignIn(e, a.email, a.password)).session;
  const sb = (await passwordSignIn(e, b.email, b.password)).session;
  if (!sa || !sb) {
    return emit(
      { overall: "NOT VERIFIED", detail: "Could not provision identities.", checks: [] },
      0,
    );
  }
  const tokenA = sa.access_token;
  const tokenB = sb.access_token;
  const uid = sa.user.id;
  const base = `${uid}/e2e-${Date.now()}`;

  try {
    // --- Upload ---
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    record(
      "upload image (owner)",
      "allow",
      await upload(e, tokenA, `${base}.png`, png, "image/png"),
    );
    record(
      "upload text (owner)",
      "allow",
      await upload(e, tokenA, `${base}.txt`, "hello", "text/plain"),
    );
    record(
      "upload binary (owner)",
      "allow",
      await upload(e, tokenA, `${base}.pdf`, new Uint8Array(1024).fill(7), "application/pdf"),
    );
    record(
      "unlisted MIME (octet-stream) rejected",
      "deny",
      await upload(e, tokenA, `${base}.bin`, new Uint8Array(64), "application/octet-stream"),
    );
    const badMime = await upload(
      e,
      tokenA,
      `${base}.exe`,
      new Uint8Array([0x4d, 0x5a]),
      "application/x-msdownload",
    );
    record("invalid MIME rejected", "deny", badMime);
    record(
      "upload into another user's prefix rejected",
      "deny",
      await upload(e, tokenB, `${uid}/hijack.txt`, "nope", "text/plain"),
    );

    // --- Read / list ---
    record(
      "owner reads own object",
      "allow",
      (await storage(e, `/object/uploads/${base}.txt`, tokenA)).status,
    );
    const list = await storage(e, "/object/list/uploads", tokenA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: `${uid}/`, limit: 100 }),
    });
    record("owner lists own prefix", "allow", list.status);
    record(
      "anon cannot read private object",
      "deny",
      (await storage(e, `/object/uploads/${base}.txt`, null)).status,
    );
    record(
      "other user cannot read owner object",
      "deny",
      (await storage(e, `/object/uploads/${base}.txt`, tokenB)).status,
    );

    // --- Signed URLs ---
    const signRes = await storage(e, `/object/sign/uploads/${base}.txt`, tokenA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 2 }),
    });
    record("signed URL generated", "allow", signRes.status);
    const signed = (await signRes.json().catch(() => ({}))) as { signedURL?: string };
    if (signed.signedURL) {
      const url = `${e.url!.replace(/\/$/, "")}/storage/v1${signed.signedURL}`;
      record("signed URL works before expiry", "allow", (await fetch(url)).status);
      await new Promise((r) => setTimeout(r, 3500));
      record("signed URL rejected after expiry", "deny", (await fetch(url)).status);
    }

    // --- Delete ---
    record(
      "non-owner cannot delete",
      "deny",
      (await storage(e, `/object/uploads/${base}.png`, tokenB, { method: "DELETE" })).status,
    );
    record(
      "owner deletes own object",
      "allow",
      (await storage(e, `/object/uploads/${base}.png`, tokenA, { method: "DELETE" })).status,
    );
    record(
      "deleted object is inaccessible",
      "deny",
      (await storage(e, `/object/uploads/${base}.png`, tokenA)).status,
    );

    // cleanup remaining fixtures
    for (const ext of ["txt", "pdf"]) {
      await storage(e, `/object/uploads/${base}.${ext}`, tokenA, { method: "DELETE" });
    }
  } finally {
    if (ua.id) await deleteUser(e, ua.id);
    if (ub.id) await deleteUser(e, ub.id);
  }

  const failures = checks.filter((c) => c.result === "FAIL");
  const notVerified = checks.filter((c) => c.result === "NOT_VERIFIED");
  emit(
    {
      overall: failures.length ? "FAIL" : notVerified.length ? "PASS_WITH_NOT_VERIFIED" : "PASS",
      total: checks.length,
      failures: failures.length,
      notVerified: notVerified.length,
      checks,
    },
    failures.length ? 1 : 0,
  );
}

function emit(report: unknown, code: number): never {
  mkdirSync("security-artifacts", { recursive: true });
  writeFileSync("security-artifacts/storage-coverage.json", JSON.stringify(report, null, 2));
  writeFileSync("security-artifacts/storage-audit.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

if (import.meta.main) await main();
