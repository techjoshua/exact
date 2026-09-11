# Structural prototype with independent worker replicas

Status: the earlier positive Node string gain does not reproduce. The prototype
remains unaccepted; no production changes occurred.

Two fresh four-worker populations counterbalance implementation assignments by
startup position: control, prototype, prototype, control, then the reverse. Each
worker receives exactly 100,000 validated warmup requests and eight balanced
1.5-second measurement blocks, two fresh drivers at concurrency 16 each. Original
worker, production Node 26.8.1, below-normal priority, full document identity checks,
and the existing count-limited scratch warmup driver are retained.

The matched factorial control restores original render functions while retaining
unused prototype helpers. It is not byte-identical to the canonical artifact.

| Population | Control mean RPS | Prototype mean RPS | Change |
| --- | ---: | ---: | ---: |
| First | 9,114 | 8,310 | -8.83% |
| Second | 8,733 | 8,621 | -1.28% |
| Pooled | 8,924 | 8,466 | -5.13% |

Individual worker means in startup order:

- First: control 8,054; prototype 7,804; prototype 8,816; control 10,175.
- Second: prototype 7,824; control 8,235; control 9,231; prototype 9,419.

The 64 measured blocks contain 836,797 valid responses and zero errors, excluding
800,000 warmups and preflights. Process variation remains substantial; these two
populations do not establish a precise regression size. They do contradict treating
the earlier 27.7% positive capture as a demonstrated optimization gain.

The remaining investigation follows the user's direction: explain why current
eXact rendering becomes more expensive inside HTTP requests when isolated rendering
is close to React. See `http-invocation-trace-2026-09-10.md`. Do not integrate the
structural prototype solely because it removes generic traversal objects.

The adjacent archive preserves runner, driver ownership helpers, measurements,
warmups, summaries, matched artifacts, worker, and verified SHA-256 manifest.
