# Native runtime acceptance

This private toolchain runs the same application and HTTP assertions in Node, Bun, Deno, and
Cloudflare workerd. Playwright then hydrates each host's own SSR output and invokes its compiled
server continuation. Miniflare manages local workerd without an account or deployment.

Build the workspace and native compiler, install Bun on PATH (or set `BUN_EXECUTABLE`), then run:

```sh
npm ci --prefix scripts/runtime-acceptance
npx playwright install --with-deps chromium
npm run test:runtimes
```

Every runtime is required; missing executables fail rather than skip. Deno runs with both default
and modern cancellation behavior. The separate lockfile pins Deno and Miniflare without adding
SDKs to framework packages. Miniflare's pinned 5.x alpha uses its official 4.x options converter.

Shared scenarios cover progress delivery and cancellation, ordinary compiled continuations,
manual dispatch and security rejection, serialization, retained application contexts, overlapping
request contexts, cleanup after success and failure, buffered and streamed SSR, DOM adoption,
pre-hydration edits, repeated remote updates, and client disposal. Fixtures belong to the owned
component composition corpus. Native entry points vary only where the host transport requires it.
Node uses the Node adapter for dispatch, with a Web Stream bridge for page responses.

The progress source continues producing updates until released: workerd may detect disconnection
only on another write. Workers enable `enable_request_signal`. No local test verifies Cloudflare's
deployed network, buffering, or plan limits; use `probe:task-progress` against a test deployment.
Build-adapter and host-framework middleware suites remain independent checks. This suite is
representative runtime boundary coverage, not a claim that every framework test runs on every host.
