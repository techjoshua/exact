# @exactjs/server

Transport-neutral server runtime for eXact operations, refreshes, patches, and server components.

## Overview

`handleExactRequest()` validates the endpoint, request envelope, operation allowlist,
authorization, CSRF policy, payload limits, batching, cancellation, and response shape. Platform
adapters translate their native request objects into this shared runtime.

Most applications compose a runtime through `@exactjs/ssr` and connect it with the adapter for
Fetch, Node, Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, or a serverless host.

SSR may return an eXact-owned ordered-chunk response body. Platform adapters should consume it through
their native integration when available; its `ReadableStream` compatibility view is constructed
only when a Web-stream host requests it. Response bodies are single-consumer values.

## Security model

Dispatch only compiler-generated contracts. Component labels, module names, debug identifiers,
and client payloads are not operation authority. Keep application services, private captures,
request resources, and secrets in trusted server context.

Register a payload decoder for every manual operation that accepts client data. It runs before
authorization and the handler. Manual replacement/list HTML must be wrapped with
`unsafeExactHtml()`; raw strings are rejected, while compiler/SSR output retains framework-owned
provenance. The unsafe constructor is an explicit audit capability, not an escaping function.

Optional DevTools access uses the same endpoint but requires explicit `allowDebug` authorization
and server-owned inspection catalogs.

See [server components](../../docs/server-components.md) and
[eXact DevTools](../../docs/devtools.md).
