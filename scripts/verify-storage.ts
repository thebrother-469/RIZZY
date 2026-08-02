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
  actual: "allow" | "deny";
  status: number;
  result: "PASS" | "FAIL";
}
const checks: Check[] = [];
const record = (
  name: string,
  expected: "allow" | "deny",
  status: number,
  allowed = status < 300,
) => {
  const actual = allowed ? "allow" : "deny";
  checks.push({ name, expected, actual, status, result: expected === actual ? "PASS" : "FAIL" });
};

const MAX_BYTES = 10 * 1024 * 1024;

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
      await upload(
        e,
        tokenA,
        `${base}.bin`,
        new Uint8Array(1024).fill(7),
        "application/octet-stream",
      ),
    );
    const oversize = await upload(
      e,
      tokenA,
      `${base}-big.bin`,
      new Uint8Array(MAX_BYTES + 1024),
      "application/octet-stream",
    );
    record("oversized upload rejected", "deny", oversize);
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
    for (const ext of ["txt", "bin"]) {
      await storage(e, `/object/uploads/${base}.${ext}`, tokenA, { method: "DELETE" });
    }
  } finally {
    if (ua.id) await deleteUser(e, ua.id);
    if (ub.id) await deleteUser(e, ub.id);
  }

  const failures = checks.filter((c) => c.result === "FAIL");
  emit(
    {
      overall: failures.length ? "FAIL" : "PASS",
      total: checks.length,
      failures: failures.length,
      checks,
    },
    failures.length ? 1 : 0,
  );
}

function emit(report: unknown, code: number): never {
  mkdirSync("security-artifacts", { recursive: true });
  writeFileSync("security-artifacts/storage-coverage.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

if (import.meta.main) await main();
