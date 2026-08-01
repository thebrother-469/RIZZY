// Local augmentation so @tanstack/react-router file routes accept a `server`
// field. TanStack Start adds this via `declare module '@tanstack/router-core'`
// in @tanstack/start-client-core, but that augmentation targets a nested
// copy of router-core in the pnpm/bun tree, so it does not always attach to
// the top-level router-core that consumer code imports. Widening it here as
// `any` re-enables Start's server-route syntax without changing the runtime.
import "@tanstack/router-core";

declare module "@tanstack/router-core" {
  interface FilebaseRouteOptionsInterface<
    TRegister = unknown,
    TParentRoute = unknown,
    TId = unknown,
    TPath = unknown,
    TSearchValidator = unknown,
    TParams = unknown,
    TLoaderDeps = unknown,
    TLoaderFn = unknown,
    TRouterContext = unknown,
    TRouteContextFn = unknown,
    TBeforeLoadFn = unknown,
    TRemountDepsFn = unknown,
    TSSR = unknown,
    TServerMiddlewares = unknown,
    THandlers = unknown,
  > {
    server?: unknown;
  }
}
