# @exactjs/component-library-policy

This Node/build-tool package is the single authorization engine used by eXact bundler and test
adapters before external component code can enter a server-executing artifact.

## Build integration

Adapters create one authorization session per build generation, record compiler component facts
and resolver-owned package provenance, authorize each resolved server component before loading it,
then atomically commit or reject the generation.

Participation manifests and static build facts are read once per resolved package instance in a
generation. `session.getTelemetry()` exposes only entry counts and lifecycle state so adapter
benchmarks can verify bounded caches without disclosing paths, package identities, or source data.
Committing, rejecting, or disposing the session releases every reported entry.

The package validates the inert component-library marker, static compiler build facts, dependency
provenance, and the application's `componentLibraries` configuration. It returns compact manifests
and server-private audits; it does not sandbox authorized JavaScript or participate in eXact plugin
lifecycle.

Application authors configure policy through `exact.config.*`. Build coordinators that produce
paired artifacts can use `readExactComponentAuthorizationIdentity()` to read the completed server
manifest and pass only its compact identity into hydration or a subsequent remote/client build.
