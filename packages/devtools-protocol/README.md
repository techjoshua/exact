# @exactjs/devtools-protocol

Transport-neutral contracts for eXact runtime inspection.

## Overview

This package defines protocol versions, runtime identities, read-only requests and responses,
bounded value previews, pagination, subscriptions, events, and the shared inspection query
service. It does not depend on Chromium, Node.js, a renderer, or a server adapter.

## Integration

Use `parseExactInspectionRequest()` and `parseExactDebugRequest()` at untrusted boundaries.
Parsers return bounded copies of own data fields and reject accessors, sparse arrays and
unsupported transport values. Use `readExactInspectionRequestId()` to correlate a rejection
without reading an untrusted getter.
Use `previewExactValue()` before values enter protocol records, and apply configured secret
redaction before traversal.
Previews use `kind: 'scalar'` for JSON-safe scalar values and `kind: 'constant'` for `undefined`,
`NaN`, `Infinity`, `-Infinity`, and `-0`. Handle the discriminator when presenting values so the
number `NaN` stays distinct from the string `"NaN"`. The `unavailable` variant describes inspection
failures. Protocol 0.8 adds constants, so upgrade preview consumers with the provider.

Task snapshots may carry bounded `arguments`, `result`, and `error` previews; transports must never
substitute raw application values for those fields.

Protocol identifiers are for correlation and selection inside inspection only. They are never
authority to invoke application operations. Pagination maxima must be positive safe integers,
and every nonterminal page advances its cursor.

[Documentation](https://techjoshua.github.io/exact/#/learn/devtools) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/devtools-protocol)
