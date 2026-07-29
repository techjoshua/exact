# @exactjs/devtools-protocol

Transport-neutral, read-only contracts for eXact runtime inspection.

The package owns protocol versioning, build/runtime identities, server catalog DTOs, bounded value
previews, pagination, request validation, runtime events, and the shared query-service interface.
It has no dependency on Chromium, Node.js, a DOM renderer, or a server adapter.

All inspection data is observational. Runtime IDs are never accepted as action, refresh,
continuation, module, or authorization selectors. Values must pass through `previewExactValue()`
before entering protocol records; compiler-qualified secrets and server resources must be redacted
before traversal.

Use `parseExactInspectionRequest()` and `parseExactDebugRequest()` at every untrusted transport
boundary. Collection requests are bounded by validated pagination and filters.
