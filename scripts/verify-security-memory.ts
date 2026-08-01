#!/usr/bin/env bun
/**
 * Auditable security-dismissal registry validator.
 *
 * Every dismissed security finding must be recorded in
 * `security/security-memory.json` with a full audit trail. This validator is
 * a CI gate: malformed records, duplicate internal_ids, and expired re-scan
 * deadlines all fail.
 *
 * Usage: bun run verify:security-memory
 */
import { readFileSync } from "node:fs";

export interface DismissalRecord {
  internal_id: string;
  title: string;
  /** Scanner severity at dismissal time. */
  severity: string;
  rationale: string;
  reviewer: string;
  /** Dismissal timestamp. */
  reviewedAt: string;
  /** Timestamp of the last executed verification/rescan. */
  rescannedAt: string;
  nextRescanAt: string;
  commit: string;
  branch: string;
  /** Executed verification evidence backing the dismissal. */
  evidence: string;
}

export interface SecurityMemoryDocument {
  version?: number;
  policy?: { maxDismissalAgeDays?: number; note?: string };
  dismissals?: unknown;
}

export interface ValidationIssue {
  internal_id?: string;
  problem: string;
}

export interface ValidationResult {
  ok: boolean;
  count: number;
  issues: ValidationIssue[];
  evidence: string;
}

const REQUIRED_FIELDS: (keyof DismissalRecord)[] = [
  "internal_id",
  "title",
  "severity",
  "rationale",
  "reviewer",
  "reviewedAt",
  "rescannedAt",
  "nextRescanAt",
  "commit",
  "branch",
  "evidence",
];

const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "WARN", "ERROR"];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SHA = /^[0-9a-f]{7,40}$/;

export function validateSecurityMemory(
  doc: SecurityMemoryDocument,
  now: Date = new Date(),
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const records = doc.dismissals;

  if (!Array.isArray(records)) {
    return {
      ok: false,
      count: 0,
      issues: [{ problem: "`dismissals` must be an array." }],
      evidence: "malformed document",
    };
  }

  const seen = new Set<string>();
  for (const [index, raw] of records.entries()) {
    if (!raw || typeof raw !== "object") {
      issues.push({ problem: `record #${index} is not an object.` });
      continue;
    }
    const r = raw as Partial<DismissalRecord>;
    const id = typeof r.internal_id === "string" ? r.internal_id : undefined;

    for (const field of REQUIRED_FIELDS) {
      const value = r[field];
      if (typeof value !== "string" || value.trim() === "") {
        issues.push({ internal_id: id, problem: `missing or empty required field \`${field}\`.` });
      }
    }
    if (typeof r.rationale === "string" && r.rationale.trim().length < 40) {
      issues.push({ internal_id: id, problem: "rationale is too short to be auditable." });
    }
    if (typeof r.severity === "string" && !SEVERITIES.includes(r.severity.toUpperCase())) {
      issues.push({ internal_id: id, problem: `unknown severity \`${r.severity}\`.` });
    }
    if (typeof r.evidence === "string" && r.evidence.trim().length < 30) {
      issues.push({ internal_id: id, problem: "evidence is too short to be auditable." });
    }
    for (const field of ["reviewedAt", "rescannedAt", "nextRescanAt"] as const) {
      const value = r[field];
      if (typeof value === "string" && !ISO.test(value)) {
        issues.push({ internal_id: id, problem: `\`${field}\` is not an ISO-8601 UTC timestamp.` });
      }
    }
    if (typeof r.commit === "string" && !SHA.test(r.commit)) {
      issues.push({ internal_id: id, problem: "`commit` is not a git commit hash." });
    }
    if (id) {
      if (seen.has(id)) issues.push({ internal_id: id, problem: "duplicate internal_id." });
      seen.add(id);
    }
    if (typeof r.nextRescanAt === "string" && ISO.test(r.nextRescanAt)) {
      const due = new Date(r.nextRescanAt).getTime();
      if (due <= now.getTime()) {
        issues.push({
          internal_id: id,
          problem: `re-scan deadline expired (${r.nextRescanAt}); the finding must be re-reviewed.`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    count: records.length,
    issues,
    evidence: issues.length
      ? issues.map((i) => `${i.internal_id ?? "(unknown)"}: ${i.problem}`).join("\n")
      : `${records.length} dismissal record(s) validated: unique ids, complete audit fields, no expired re-scan deadlines.`,
  };
}

export const SECURITY_MEMORY_PATH = "security/security-memory.json";

export function loadSecurityMemory(path = SECURITY_MEMORY_PATH): SecurityMemoryDocument {
  return JSON.parse(readFileSync(path, "utf8")) as SecurityMemoryDocument;
}

if (import.meta.main) {
  let result: ValidationResult;
  try {
    result = validateSecurityMemory(loadSecurityMemory());
  } catch (e: unknown) {
    result = {
      ok: false,
      count: 0,
      issues: [{ problem: `cannot read ${SECURITY_MEMORY_PATH}: ${String(e)}` }],
      evidence: "unreadable registry",
    };
  }
  console.log(JSON.stringify(result, null, 2));
  console.error(`[${result.ok ? "PASS" : "FAIL"}] security-memory-audit`);
  process.exit(result.ok ? 0 : 1);
}
