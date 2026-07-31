# Parcel Lab

Parcel Lab is the substantial eXact server-components demo: a progressively rendered, reactive multi-carrier domestic shipping calculator. It runs with deterministic fictional DOOP rates and can optionally join live USPS, UPS, FedEx, and DHL responses into the same ranked list.

## Run locally

From the repository root:

```sh
npm run dev:shipping
```

Open `http://localhost:4175`. No environment configuration is required for DOOP. Copy `.env.example` to an untracked `.env` or supply variables through the process environment to enable carriers; `SHIPPING_PROVIDERS` defaults to `doop`.

```sh
npm run build:shipping
npm run start:shipping
npm run test:shipping
```

Real-provider credentials and OAuth tokens remain server-only. Rates are held in memory for no more than five minutes and are never persisted. Parcel Lab does not buy labels or generate tracking numbers. Review each carrier's current API and display terms before making a public comparison service; DHL is implemented but intentionally omitted from the default configuration because its rating terms can restrict disclosure, storage, and competitive use.

The workspace defines route and carrier work as ordinary functions. It authors
`TaskContext.server()` only where server placement is an architectural
boundary, and `TaskContext.client()` only on the state-publishing coordinators
whose server children otherwise make placement indivisible. Default parallel
child scheduling, reactive latest-wins activation, browser placement, and
optional-signal injection remain inferred. Components never acquire an
`ExactClient`, invoke transport methods, or name continuation identifiers. The
compiler keeps provider modules in the server artifact and emits opaque
dispatch stubs in the client artifact.

The server composes both generated executor-bearing roots exported by
`App.exact.server`: the page and `CalculatorWorkspace`. This is the explicit
allowlist for the workspace's opaque route and provider continuations; authored
components still never import or invoke those IDs.

The rate refresh task uses defaulted `draft` and provider parameters as
captured inputs. They are sampled once whenever the tracked revision activates
a generation, so edits alone do not create an additional trigger and the
generation uses one stable request snapshot.

Workspace initialization also uses `peek()` deliberately when copying the
server-provided initial model into browser-owned mutable state. Those reads are
one-time ownership transfer, not standing reactive prop dependencies; removing
the snapshot changes the generated client-island contract.

Route and carrier branches are attached child tasks. Each child awaits its own
server operation and publishes independently, while the parent reactive
generation is inherently latest-wins and owns cancellation and stale-write
fencing. The compiler injects its signal into the debounce helper's optional
final `AbortSignal`; the component does not maintain a second revision fence,
pass that signal manually, or inspect cancellation after an await.

The checked-in carrier responses under `src/providers/fixtures` are fabricated, sanitized contract fixtures and contain no account data. ZIP map points are built from the U.S. Census Bureau's 2025 ZCTA Gazetteer file; see `src/data/ATTRIBUTION.md`.

Live smoke tests are intentionally outside normal CI. Set `RUN_LIVE_RATE_TESTS=1` only in a credentialed operator environment.
