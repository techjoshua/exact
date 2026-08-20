# @exactjs/instrumentation

Small, shared profiling contracts for eXact compiler, build, server, and runtime integrations.

## Usage

Integrations publish immutable `ExactProfileEvent` values to an `onProfile` sink. Use
`createProfileCollector()` for an in-memory event list and `summarizeProfile()` for totals by
subsystem and phase.
Framework publishers contain sink exceptions: profiling is observational and cannot turn a
successful render, request, compilation, or reactive flush into a failure.

Profile events contain elapsed time, counts, and bounded scalar metadata. They must not contain
component instances, state values, request bodies, secrets, or other unbounded application data.
Sink failures are observational and do not affect application behavior.
