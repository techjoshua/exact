# Using @exactjs/instrumentation

Use the shared immutable profiling envelopes for bounded timings and counts. Profiling sinks are
observational: isolate sink failures and do not let them change scheduling, cancellation,
rendering, ownership, or server dispatch.

DevTools may project these envelopes as `profile` events, but must not add raw component instances,
callbacks, requests, response bodies, state values, context resources, or secrets. Keep hot-path
publication shallow and defer bounded presentation work to an attached consumer.
