# Native task-progress acceptance

This private test toolchain runs compiler-generated continuations over real loopback HTTP in Deno
and Cloudflare workerd, managed by Miniflare. It needs no Cloudflare account or deployment.

Build the workspace and native compiler first, then run:

```sh
npm ci --prefix scripts/task-progress
npm run test:task-progress:edge
```

The separate lockfile pins native test tools without adding deployment SDKs to framework packages.
Miniflare is pinned to its current 5.x alpha release, including patched dependencies; its official
4.x options converter supplies the test configuration. Deno runs without project configuration or
network module downloads. Tests own and close servers, child processes, gates, and temporary builds.

Coverage includes incremental progress, terminal success and failure, unsupported buffered fallback,
repeated requests, task cancellation and cleanup, and the next invocation. A continuing upstream
source supplies progress until completion: workerd may detect disconnection only on another write.
The Worker enables `enable_request_signal`. Local workerd does not verify Cloudflare's deployed
network, buffering, or plan limits; use the separate `probe:task-progress` command against a test
deployment for that boundary.
