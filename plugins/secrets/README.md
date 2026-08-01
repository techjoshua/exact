# @exactjs/secrets

Runtime-scoped secret resolution for eXact applications and plugins.

## Overview

The package provides secret references, provider contracts, configuration, ordered provider
selection, lifecycle management, and bounded resolution. Secret values remain server-owned.

## Safety

Do not place secret values in client configuration, hydration data, compiler catalogs,
diagnostics, profiling, logs, errors, audits, or DevTools responses. Inspection may expose a
qualified secret name or presence only when policy allows it; configure redaction before values
are traversed.

See [server context and data policy](../../docs/server-context-and-data-policy.md) and
[eXact DevTools](../../docs/devtools.md).
