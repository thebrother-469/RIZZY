import { test, expect } from "@playwright/test";

test("POST /api/public/csp-report returns 204 for valid report", async ({ request }) => {
  const res = await request.post("/api/public/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": {
        "blocked-uri": "https://evil.example.com/x.js",
        "violated-directive": "script-src",
        "effective-directive": "script-src",
        "source-file": "https://rizzgod-ai.vercel.app/",
        "line-number": 42,
        "status-code": 200,
      },
    }),
  });
  expect(res.status()).toBe(204);
});

test("POST /api/public/csp-report ignores malformed JSON", async ({ request }) => {
  const res = await request.post("/api/public/csp-report", {
    headers: { "content-type": "application/json" },
    data: "{not-json",
  });
  expect(res.status()).toBe(204);
});

test("POST /api/public/csp-report rejects oversized payload", async ({ request }) => {
  const huge = "x".repeat(20_000);
  const res = await request.post("/api/public/csp-report", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ "csp-report": { "blocked-uri": huge } }),
  });
  expect(res.status()).toBe(204);
});

test("sitemap.xml lists /auth and /reset-password", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("/auth</loc>");
  expect(body).toContain("/reset-password</loc>");
});

test("robots.txt disallows /mcp and /.well-known", async ({ request }) => {
  const res = await request.get("/robots.txt");
  const body = await res.text();
  expect(body).toMatch(/Disallow:\s*\/mcp/);
  expect(body).toMatch(/Disallow:\s*\/\.well-known/);
});

test("homepage sends Content-Security-Policy-Report-Only header", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const csp = res.headers()["content-security-policy-report-only"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("report-uri /api/public/csp-report");
});
