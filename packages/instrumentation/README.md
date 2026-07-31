# @exactjs/instrumentation

Shared profiling contracts and collectors for eXact compiler, bundler, server, and runtime
integrations.

Profile events carry a subsystem, phase, elapsed time, and bounded serializable attributes.
Integrations accept an `onProfile` sink so applications and tooling can aggregate timings without
coupling to internal implementations.

Use the supplied collector utilities for deterministic reports. Avoid placing secrets, request
bodies, or unbounded application data in profiling attributes.

Full-stack DevTools may translate these bounded envelopes into `profile` events. Sink failures are
observational and must not affect scheduling, rendering, cancellation, ownership, or dispatch.
See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
