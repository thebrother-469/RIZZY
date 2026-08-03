/**
 * Fail-fast CI secret validation.
 *
 * Every release-gate stage declares the secrets it cannot run without. A
 * missing secret must fail LOUDLY at the start of the job instead of
 * degrading a suite into a silent "NOT VERIFIED" pass 20 minutes later.
 *
 *   bun run scripts/ci-secrets.ts <stage>
 *
 * Stages: build | ssr | security | integration | preview
 */
const STAGES: Record<string, string[]> = {
  build: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
  ssr: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
  security: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  integration: [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TEST_USER_EMAIL",
    "E2E_TEST_USER_PASSWORD",
  ],
  preview: [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TEST_USER_EMAIL",
    "E2E_TEST_USER_PASSWORD",
    "PLAYWRIGHT_BASE_URL",
  ],
};

// Aliases: either name satisfies the requirement.
const ALIASES: Record<string, string[]> = {
  SUPABASE_URL: ["VITE_SUPABASE_URL"],
  SUPABASE_PUBLISHABLE_KEY: ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
  PLAYWRIGHT_BASE_URL: ["E2E_BASE_URL"],
};

const stage = process.argv[2] ?? "";
const required = STAGES[stage];

if (!required) {
  console.error(`Unknown stage "${stage}". Expected one of: ${Object.keys(STAGES).join(", ")}`);
  process.exit(2);
}

const present = (name: string) =>
  [name, ...(ALIASES[name] ?? [])].some((n) => (process.env[n] ?? "").trim().length > 0);

const missing = required.filter((n) => !present(n));
const ok = missing.length === 0;

for (const name of required) {
  console.log(`${present(name) ? "  ok " : "MISSING"}  ${name}`);
}

const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary) {
  const lines = [
    `### Secret preflight — \`${stage}\``,
    "",
    ...required.map((n) => `- ${present(n) ? "✅" : "❌"} \`${n}\``),
    "",
    ok ? "All required secrets are bound." : `**Missing: ${missing.join(", ")}**`,
    "",
  ];
  await Bun.write(summary, (await Bun.file(summary).text().catch(() => "")) + lines.join("\n"));
}

if (!ok) {
  console.error(
    `::error::Stage "${stage}" cannot run — missing repository secrets: ${missing.join(", ")}. ` +
      `Bind them under Settings → Secrets and variables → Actions.`,
  );
  process.exit(1);
}
console.log(`Secret preflight passed for stage "${stage}".`);
