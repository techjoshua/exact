# @exactjs/server

Transport-neutral server runtime for eXact operations, refreshes, patches, and server components. Applications usually compose it through `@exactjs/ssr` and the Fetch, Node, Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, or serverless adapter.

`handleExactRequest()` validates endpoints, request envelopes, operation allowlists, authorization, CSRF policy, payload limits, batching, cancellation, and response shapes. Platform adapters translate native requests into this shared runtime.

## Hydration configuration

For server-rendered controls that invoke operations, derive browser configuration from the server's executor contract:

```ts
import { composeExactExecutorContract, createExactHydrationConfig } from '@exactjs/server';
import { Page } from './Page.exact.server.js';

const contract = composeExactExecutorContract([Page], { endpoint: '/__exact' });
const hydration = createExactHydrationConfig(contract, { includeContinuations: false });
```

Spread `hydration` into `renderExactRequestToProgressiveHtmlResponse()` or the corresponding hydratable SSR renderer's options. Use `includeContinuations: false` when the client imports generated hydration registration supplying those contracts. Otherwise the helper includes browser-visible continuation contracts. Its optional `state` and `publicContexts` must be safe to disclose. Component libraries do not create consumer executor contracts or hydration configuration. Plain SSR without activation needs neither.

## Transport and limits

Fetch-compatible adapters pass the native stream through. Explicit `limits.maxRequestBytes` caps cancel overflow before fully buffering the body. Without a cap, bodies above 4 MiB warn and continue. Choose caps for your payloads and memory budget.

Invocation responses also warn and continue above default thresholds. Positive safe-integer response caps in `limits` stop excess output with an error. The server logger reports the option, scope, threshold, and measured amount. See [production limits](https://github.com/techjoshua/exact/blob/main/docs/native-ssr-production-guide.md#limits).

Adapter authors use `handleExactFetchRequest()` for canonical Fetch request translation and `exactResponseToFetchResponse()` for portable responses. Bun retains its specialized Blob-backed conversion with shared request translation.

SSR responses expose an explicit buffered or produced `body`. Pass the complete response to the adapter. Buffered bodies support synchronous text/blob collection. Progressive bodies require asynchronous consumption, and direct stream responses omit text `body`. Ordered-chunk bodies are single-consumer values. Native adapters create their `ReadableStream` view only when requested.

Custom synchronous producers that know the complete UTF-8 body size can call `environment?.setBodyByteLength?.(bytes)` after the final write. Include every output span or omit the hint and let the adapter count. See [SSR output accounting](https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md).

A binding gateway forwards original payload bytes and credentials after request authentication. Each service owns its operation policy. Add agreed headers with `transformForwardedRequest` and place gateway endpoints ahead of JSON body-parsing middleware.

## Security model

Dispatch only compiler-generated contracts. Component labels, module names, debug identifiers, and client payloads are not operation authority. Keep services, private captures, request resources, and secrets in trusted server context.

Manual operations accepting client data require a payload decoder. It runs before `authorizeOperation` and the handler. Request-level `authorize` and `validateCsrf` run before body parsing. Manual replacement/list HTML requires `unsafeExactHtml()`. Raw strings reject, while compiler/SSR output retains framework-owned provenance. The unsafe constructor is an explicit audit capability, not an escaping function.

Optional DevTools access shares the endpoint but requires explicit `allowDebug` authorization for origin-less clients and server-owned inspection catalogs. Same-origin development browsers may use the catalog-based default. Runtime observations are bounded to one authorized operation request, returned with its response, and disposed at completion. Browser DevTools owns cross-request history and subscriptions.

## Task progress

Browser-initiated tasks can deliver progress over Fetch/NDJSON. On buffering deployments, set `progress: { supported: false, reason: "deployment buffers responses" }` in server context. Tasks still run once and return their ordinary result with an attributed warning. See [streaming deployment requirements](../../docs/ssr-hydration.md#streaming-deployment-requirements).

See [server components](https://github.com/techjoshua/exact/blob/main/docs/server-components.md) and [eXact DevTools](https://github.com/techjoshua/exact/blob/main/docs/devtools.md).

[Documentation](https://techjoshua.github.io/exact/#/learn/server-execution) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/server)
