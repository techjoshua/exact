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

The workspace defines route and carrier work as ordinary functions whose final
`TaskContext.server()` policy requests server placement. Application
components call those functions directly; they never acquire an `ExactClient`,
invoke transport methods, or name continuation identifiers. The compiler keeps
provider modules in the server artifact and emits opaque dispatch stubs in the
client artifact.

The rate refresh task uses defaulted `draft` and provider parameters as
captured inputs. They are sampled once whenever the tracked revision activates
a generation, so edits alone do not create an additional trigger and the
generation uses one stable request snapshot.

Route and carrier branches are attached child tasks. Each child awaits its own
server operation and publishes independently, while the parent `latest()`
generation owns cancellation and stale-write fencing. The component does not
maintain a second revision fence or manually inspect cancellation after an
await.

The checked-in carrier responses under `src/providers/fixtures` are fabricated, sanitized contract fixtures and contain no account data. ZIP map points are built from the U.S. Census Bureau's 2025 ZCTA Gazetteer file; see `src/data/ATTRIBUTION.md`.

Live smoke tests are intentionally outside normal CI. Set `RUN_LIVE_RATE_TESTS=1` only in a credentialed operator environment.
