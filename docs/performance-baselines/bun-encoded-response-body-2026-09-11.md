# Explicit UTF-8 encoding before native Bun Response

Hypothesis: converting completed eXact HTML to an owned Buffer before constructing Response could recover 5-20% if native string conversion contributes to the large-document cost. The scratch bundle changes only the buffered-text branch of the Bun response adapter to Buffer.from(body.toText(), "utf8"). The shared renderer and document/hydration content remain unchanged. React is unchanged.

Native Bun string HTTP, 96 incidents, concurrency 32, five-second blocks after ten-second warmup. Fresh current/candidate/React workers then reversed order. Each eXact worker runs immediate/scheduled/immediate. Machine workload varied materially; candidate first-repeat immediate controls fell from 2,851 to 2,378 RPS, so their mean is not a stable baseline.

| Repeat | Mode | Current RPS | Encoded RPS | Change |
| --- | --- | ---: | ---: | ---: |
| 1 | normal | 2,520 | 2,615 | +3.76% |
| 1 | scheduled | 2,448 | 2,278 | -6.94% |
| 2 | normal | 2,675 | 2,813 | +5.15% |
| 2 | scheduled | 2,214 | 2,186 | -1.25% |

180,942 complete measured responses validated with zero errors. Artifact and invocation guards pass.

Encoding did not improve the scheduled path and the immediate-path apparent gains are confounded by drift. No production change adopted. User steering moved the next investigation to adaptive lag-triggered scheduling and limiting total batch starts per event-loop turn.
