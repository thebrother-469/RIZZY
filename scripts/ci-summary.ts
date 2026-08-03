/**
 * Standardized CI artifact summary.
 *
 * Reads every JSON verification artifact in security-artifacts/ and renders a
 * single table into the GitHub Actions job summary so a reviewer sees the
 * release posture without downloading artifacts.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "security-artifacts");

type Row = { artifact: string; status: string; detail: string };

const rows: Row[] = [];

if (existsSync(DIR)) {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const raw = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Record<string, unknown>;
      const status = String(raw["status"] ?? "UNKNOWN");
      const summary = raw["summary"] as { pass?: number; fail?: number; notVerified?: number } | undefined;
      const detail = summary
        ? `pass ${summary.pass ?? 0} · fail ${summary.fail ?? 0} · not verified ${summary.notVerified ?? 0}`
        : String(raw["reason"] ?? "—");
      rows.push({ artifact: file, status, detail });
    } catch (err) {
      rows.push({ artifact: file, status: "UNREADABLE", detail: String(err) });
    }
  }
}

const icon = (s: string) =>
  s === "PASS" ? "✅" : s === "FAIL" ? "❌" : s === "NOT_VERIFIED" ? "⚠️" : "❔";

const lines = [
  "### Verification artifacts",
  "",
  "| Artifact | Status | Detail |",
  "| --- | --- | --- |",
  ...(rows.length
    ? rows.map((r) => `| \`${r.artifact}\` | ${icon(r.status)} ${r.status} | ${r.detail} |`)
    : ["| _none produced_ | ❔ | — |"]),
  "",
];

const out = lines.join("\n");
console.log(out);

const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
if (summaryPath) {
  const prev = await Bun.file(summaryPath)
    .text()
    .catch(() => "");
  await Bun.write(summaryPath, prev + out);
}

// Reporting only — never fails the job; the stages themselves are the gate.
process.exit(0);
