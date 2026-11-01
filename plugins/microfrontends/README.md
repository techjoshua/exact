# @exactjs/microfrontends

Federated microfrontend support for eXact hosts and remotes.

## Overview

The package defines remote exposure and consumption configuration, shared-package policy,
development discovery, build artifacts, client loading, SSR coordination, and root lifecycle. It
integrates with the eXact build and server runtimes rather than replacing them.

## Runtime and build entries

The package root exposes `RemoteComponent`, remote loading, binding registration, and the Web API
binding gateway in browser builds. The Node root additionally exposes build adapters and artifact planners.
Use `@exactjs/microfrontends/client` when an explicit runtime-only import is useful.

## Usage model

Keep host names, remote exposures, shared versions, and server gateways explicit. Load remote
components from their compiler-produced artifacts, and keep page-authored child content owned by
the page root. Framework runtime providers are shared automatically, including specialized
reactive helpers. Deploy updated host providers before a remote that requires them.
Configure each remote's `integrity` when its entry bytes must be verified before
execution. The browser enforces that SRI pin through the generated module-entry loader; an unpinned
entry is explicitly trusted executable authority. Replacement resolvers should return
`{ clientEntry, integrity }` for pinned build rotation.
Remote entry waits stop with their owning component. Shared work remains active for other callers
and is released when the last caller cancels. Direct `loadExactRemoteModule()` calls can supply an
`AbortSignal` for application-owned cancellation or deadlines. The loader imposes no time or concurrency limit.
On SSR, `RemoteComponent` is emitted as a compiler-owned client boundary; its browser loader does
not execute on the server. Page-authored children retain their page instances and lifecycle when a
remote build or cross-root patch replaces the remote ancestor around them.

Server-executing remote builds may carry the compact component-library authorization identity
created by `@exactjs/component-library-policy`. The remote entry, hydration client, gateway, and
retained component host preserve that identity and reject a mismatched build before operation
dispatch; full authorization and audit manifests remain server-private.
For paired Vite builds, read the completed server manifest with
`readExactComponentAuthorizationIdentity()` and pass the result as the eXact Vite plugin's
`componentAuthorization` option while producing the remote artifact.

Vite/Rollup, Webpack 5, and Bun 1.3+ consume the same exposure plan. Webpack integration is owned
by `ExactWebpackPlugin`; Bun remote producers call `exactBuild()` from `@exactjs/bun-plugin` so
asynchronous plan preparation happens before `Bun.build`. Both adapters preserve actual emitted
CSS, asset, and lazy-chunk locations, provided-package bootstrap order, and last-valid generation
publication.

For architecture and deployment examples, see
[microfrontends](https://github.com/techjoshua/exact/blob/main/docs/microfrontends.md).

[Documentation](https://techjoshua.github.io/exact/#/plugins/microfrontends) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/plugins/microfrontends)
