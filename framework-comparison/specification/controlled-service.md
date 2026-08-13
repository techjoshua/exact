# Controlled service contract

The controlled track uses JSON over HTTP and a server-sent event stream. Successful mutation responses contain
the authoritative resource directly. Errors use `{ "error": { "code", "message", "current"? } }`.

| Method | Path                          | Purpose                                          |
| ------ | ----------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                     | Readiness probe.                                 |
| `GET`  | `/api/session`                | Current user and all fixture users.              |
| `GET`  | `/api/incidents`              | Severity-ordered incident summaries.             |
| `GET`  | `/api/incidents/:id`          | One incident including comments.                 |
| `POST` | `/api/incidents/:id/claim`    | Claim with `{ actorId, expectedVersion }`.       |
| `POST` | `/api/incidents/:id/comments` | Add `{ actorId, body, clientMutationId }`.       |
| `POST` | `/api/incidents/:id/analysis` | Start an asynchronous analysis job.              |
| `GET`  | `/api/jobs/:id`               | Read authoritative job progress.                 |
| `GET`  | `/api/events`                 | Receive `incident` and `job` server-sent events. |

The harness alone may call `POST /__benchmark/reset` with
`x-benchmark-control: fixture-reset`. Applications must not expose reset controls or call the endpoint during a
scenario. Unknown resources return `404`, invalid input returns `400`, and stale versions return `409` with the
current incident in `error.current`.

`clientMutationId` is a non-empty participant-generated identifier. Repeating the same comment
request with the same identifier returns the first accepted result without creating a second
comment or advancing the incident version again. Controlled-service responses allow cross-origin
browser access so every participant may run on its own loopback port; `OPTIONS` preflight is part
of the contract.

The reference service deliberately uses the Fetch `Request`/`Response` boundary so it can run behind different
Node adapters without changing domain behavior. It is a comparison fixture, not a recommended production API.
