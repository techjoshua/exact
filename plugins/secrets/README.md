# @exactjs/secrets

Runtime-scoped secret resolution for eXact applications and plugins.

## Overview

The package provides secret references, provider contracts, configuration, ordered provider
selection, lifecycle management, and named resolution. Secret values remain server-owned. Initialization publishes a complete provider snapshot, and
disposal cancels pending loads and clears resolved values. Custom providers should observe their
context signal. An empty string is a configured value, so providers enforce any credential-specific
non-empty requirement. Environment-file providers require filesystem access. Hosts without it
can supply a provider backed by secret bindings or a secret service. Provider handles and returned
name dictionaries follow TypeScript readonly guarantees without runtime freezing. Every accepted
environment-file identifier can be resolved by name. Pending initialization and file loads retain
the cancellation signal captured when they start.

## Safety

Do not place secret values in client configuration, hydration data, compiler catalogs,
diagnostics, profiling, logs, errors, audits, or DevTools responses. Server inspection may expose a
qualified secret name or presence only when policy allows it. Configure server redaction before
values are traversed.

See [server context and data policy](https://github.com/techjoshua/exact/blob/main/docs/server-context-and-data-policy.md) and
[eXact DevTools](https://github.com/techjoshua/exact/blob/main/docs/devtools.md).

[Documentation](https://techjoshua.github.io/exact/#/plugins/secrets) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/plugins/secrets)
