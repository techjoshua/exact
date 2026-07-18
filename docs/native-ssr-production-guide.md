# Native SSR Production Guide

This guide is the production contract for native eXact SSR, actions, refreshes,
and server components. It applies to Fetch, Express, Hapi, Node, and framework
adapters that translate the runtime-neutral request and response shapes.

## Response lifecycle

Every request has one cancellation signal, one request context scope, and one
response-control state.

| Stage | Allowed behavior |
| --- | --- |
| Before commit | Components and request providers may set status and headers or issue a redirect through `RequestContext`. Relevant asynchronous tasks settle before the response is exposed. |
| Commit | eXact snapshots status and headers when the response object is returned to the adapter. A progressive response commits before its first body byte. |
| After commit | Status, header, and redirect mutation throws `RequestResponseCommittedError`. A body-stream failure terminates or errors the transport; it cannot replace the committed status or headers. |

An ordinary HTML render rejects before a response exists if rendering,
serialization, task stabilization, or provider initialization fails. The host
maps that failure to its error response. A stream failure after commit errors
the Fetch body, destroys an Express response, or terminates the corresponding
host stream. Applications must not attempt to render a second document into the
same response.

`RequestContext.redirect(location, status)` resolves relative locations against
the trusted request URL, records the `Location` header, and requires a 3xx
status. Explicit request-context status and headers take precedence over render
option defaults.

## Cancellation and cleanup

Adapters must connect client disconnects and host aborts to the request signal.
eXact propagates that signal through:

- Application and request context factories.
- Component tasks and task-owned resources.
- Initial rendering and task stabilization.
- Actions, refreshes, batches, and response streams.
- Provider and request-scope disposal.

Request resources remain alive until a non-stream response finishes or a stream
closes, errors, or is cancelled. Application-scoped resources remain alive
until the server runtime is disposed. Cleanup runs in dependency-safe reverse
order. A cleanup failure is retained as suppressed diagnostic information when
another failure is already primary.

Do not start detached request work without copying the data it needs and giving
it a separate lifetime. The request context and its signal are invalid after
request disposal.

## Cache and `Vary`

Action, refresh, and NDJSON protocol responses are `Cache-Control: no-store`.
For HTML, the application owns cache policy:

- Use `private, no-store` for user-specific or authorization-dependent pages.
- Use `private, max-age=0, must-revalidate` when a private revalidation policy
  is intentional.
- Use public caching only when the complete rendered output is independent of
  cookies, authorization, request-scoped secrets, and user-specific context.
- Include every representation-selecting request header in `Vary`; common
  examples are `Accept-Encoding`, `Accept-Language`, and host-controlled tenant
  or experiment headers.
- Do not put `Cookie` in `Vary` and expect useful shared-cache behavior. Prefer
  private caching for cookie-dependent output.

Cache keys must include the normalized URL and every application input that can
change public output. A CDN or reverse proxy must not cache progressive or
personalized HTML merely because the response status is successful.

## Authentication and sessions

Authenticate the platform request before or while creating request-scoped
contexts. Expose trusted identity, authorization, and current-session data as
request-scoped contexts. eXact does not retain a cross-request session scope.

Server actions and refreshes independently re-run authorization and CSRF
checks. Client-visible roles or `hasRole()` helpers are presentation data, not
an enforcement boundary. Session rotation and `Set-Cookie` occur before
response commit. Session persistence belongs to the application's session
store; application-scoped contexts may own store clients, but not a user's
current session value.

## Deployment topology

The following topologies are supported when they preserve the request and
artifact contracts:

- A single Node process serving HTML and eXact endpoints.
- Serverless or edge-style Fetch handlers with per-isolate application scope
  and per-invocation request scope.
- Separate HTML and action/refresh services using the same manifest IDs,
  artifact version, authorization rules, and hydration endpoint configuration.
- A reverse proxy or CDN in front of any of the above, subject to the cache
  rules in this guide.

Deploy client assets, server artifacts, and portable manifests from one build.
Do not mix manifest IDs or client chunks from different releases. Use
content-addressed client assets or an atomic release directory, and keep an old
server release available while clients from that release can still invoke its
action or refresh IDs.

## Limits

Production configurations should set explicit ceilings. Current server defaults
are:

| Resource | Default |
| --- | ---: |
| Batch operations | 100 |
| Concurrent batch operations | 8 |
| JSON graph depth | 100 |
| JSON graph values/properties | 100,000 |
| Request bytes | 4 MiB |
| Non-stream response bytes | 16 MiB |
| Patches per operation | 10,000 |
| Stream events | 100,000 |
| Stream bytes | 16 MiB |

SSR additionally bounds task passes and duration, tree depth and node count,
output bytes, stream chunks and bytes, and hydration graph depth, nodes, and
bytes. Lower these limits for public anonymous endpoints and raise them only
with measured fixtures.

## Observability

Install an eXact `Logger` in production and carry a trace identifier from
`traceparent` or `x-request-id`. Record:

- Request method, normalized route, status, duration, and cancellation.
- Render mode, component or boundary ID, manifest/package identity, and release.
- Action/refresh ID, authorization outcome, patch count, response bytes, and
  fallback replacement.
- Stream start, completion, cancellation, and post-commit failure.
- Policy and capability diagnostics without logging secret values.

Compiler diagnostics and portable manifests provide component, boundary,
package, and policy identities. Keep those IDs in source maps and release
metadata so runtime events can be mapped to authored code.

## CSP and rendering safety

Prefer an external hydration bootstrap under strict CSP. If inline scripts are
enabled, provide a request-specific nonce and apply it to every framework-owned
executable script. `unsafeHtml()` requires explicit application policy and
dependency grants; it is not sanitized by eXact. Native URL behavior blocks
React-compatible `javascript:` forms, while broader URL policy remains an
application concern.

## Package publication

A component package publishes transpiled shared/client/server artifacts,
declarations, portable manifests, ordered conditional exports, and
`exact.manifests` metadata. The repository owns transpilation and package
assembly. Validate the packed tarball rather than the source tree, and verify
client, SSR, and server-component conditions in clean consumers.

Generated shared and target-specific dual modules export the declarations
needed by generated client/server imports. Those internal exports need not be
re-exported by the package root barrel unless they are authored public API.

## Release certification

Before production release:

1. Run production and test type-checking.
2. Run package, native server-component, and application integration tests.
3. Build client and server production bundles.
4. Validate clean installed component-package tarballs.
5. Exercise cancellation, pre-commit failure, post-commit stream failure,
   redirects, cache headers, authorization, CSRF, and configured resource
   ceilings.
6. Confirm manifests and client/server assets come from one release.
7. Verify logger redaction and trace correlation in the deployment environment.
