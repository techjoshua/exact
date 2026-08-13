# @exactjs/devtools-protocol

Transport-neutral contracts for eXact runtime inspection.

## Overview

This package defines protocol versions, runtime identities, read-only requests and responses,
bounded value previews, pagination, subscriptions, events, and the shared inspection query
service. It does not depend on Chromium, Node.js, a renderer, or a server adapter.

## Integration

Use `parseExactInspectionRequest()` and `parseExactDebugRequest()` at untrusted boundaries.
Use `previewExactValue()` before values enter protocol records, and apply configured secret
redaction before traversal.
Task snapshots may carry bounded `arguments`, `result`, and `error` previews; transports must never
substitute raw application values for those fields.

Protocol identifiers are for correlation and selection inside inspection only. They are never
authority to invoke application operations.
