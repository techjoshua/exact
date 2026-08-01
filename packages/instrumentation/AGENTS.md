# Using `@exactjs/instrumentation`

See the [README](./README.md) for the profiling envelope API. Use this package when a framework
integration needs to publish bounded timing and count observations.

- Treat sinks as observational; they must not affect application scheduling or behavior.
- Keep hot-path payloads small.
- Never include raw component instances, callbacks, state values, requests, or secrets.
