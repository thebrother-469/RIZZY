/**
 * Automatic discovery of /api/public/* endpoints — sourced from the
 * TanStack Router generated route manifest (`src/routeTree.gen.ts`).
 *
 * This is the same manifest the running app uses to serve requests, so
 * any newly created server route under `src/routes/api/public/*`
 * automatically joins the smoke + contract matrices as soon as the
 * router regenerates the tree — with zero manual updates and no
 * filesystem-globbing drift.
 *
 * We still read the route source file to enumerate the HTTP methods
 * the handler declares (the manifest itself does not encode methods).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PublicEndpoint {
  path: string;
  method: HttpMethod;
  source: string;
  request: { headers?: Record<string, string>; data?: string };
  acceptableStatuses: number[];
}

const MANIFEST_IMPORT_REGEX = /from\s+['"]\.\/routes\/(api\/public\/[a-zA-Z0-9._$-]+)['"]/g;
const HANDLER_REGEX = /\b(GET|POST|PUT|PATCH|DELETE)\s*:\s*(?:async\s*)?\(?\s*(?:\{|\()/g;

function probeFor(path: string, method: HttpMethod) {
  if (path.endsWith("/csp-report")) {
    return {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": { "document-uri": "https://x", "violated-directive": "script-src" },
      }),
      acceptableStatuses: [204, 400, 429],
    };
  }
  if (path.endsWith("/lemon-webhook")) {
    return {
      headers: { "content-type": "application/json", "x-signature": "0".repeat(64) },
      data: JSON.stringify({ meta: {}, data: {} }),
      acceptableStatuses: [400, 401, 403, 429],
    };
  }
  if (path.endsWith("/lemon-sync")) {
    return {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({}),
      acceptableStatuses: [401, 403, 429],
    };
  }
  if (path.endsWith("/lemon-checkout")) {
    return {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ variant_id: "smoke" }),
      acceptableStatuses: [400, 401, 403, 429],
    };
  }
  if (path.endsWith("/health")) {
    return { acceptableStatuses: [200, 503] } as const;
  }
  return method === "GET"
    ? { acceptableStatuses: [200, 204, 400, 401, 403, 404, 405, 429] }
    : {
        headers: { "content-type": "application/json" },
        data: "{}",
        acceptableStatuses: [200, 204, 400, 401, 403, 404, 405, 429],
      };
}

export function discoverPublicEndpoints(): PublicEndpoint[] {
  const manifestPath = resolve(process.cwd(), "src/routeTree.gen.ts");
  let manifest: string;
  try {
    manifest = readFileSync(manifestPath, "utf8");
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const out: PublicEndpoint[] = [];
  let m: RegExpExecArray | null;
  MANIFEST_IMPORT_REGEX.lastIndex = 0;
  while ((m = MANIFEST_IMPORT_REGEX.exec(manifest)) !== null) {
    const relative = m[1]; // e.g. "api/public/health"
    if (seen.has(relative)) continue;
    seen.add(relative);

    const path = "/" + relative;
    const sourceRel = `src/routes/${relative}.ts`;
    let src: string;
    try {
      src = readFileSync(resolve(process.cwd(), sourceRel), "utf8");
    } catch {
      continue;
    }

    const methods = new Set<HttpMethod>();
    HANDLER_REGEX.lastIndex = 0;
    let hm: RegExpExecArray | null;
    while ((hm = HANDLER_REGEX.exec(src)) !== null) {
      methods.add(hm[1] as HttpMethod);
    }

    for (const method of methods) {
      const probe = probeFor(path, method);
      out.push({
        path,
        method,
        source: sourceRel,
        request: {
          headers: (probe as { headers?: Record<string, string> }).headers,
          data: (probe as { data?: unknown }).data,
        },
        acceptableStatuses: probe.acceptableStatuses as number[],
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
