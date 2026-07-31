# @exactjs/convex

The React-facing provider crosses an explicit compatibility boundary backed by a stable,
framework-owned native eXact provider identity.

eXact adapter for Convex React integrations.

The package bridges supported Convex provider and client behavior into component-owned eXact
context and reactive sources. It also publishes compatibility metadata so the build engine can
substitute supported React exports when their installed versions match.

Use the native entrypoint in eXact components. Keep network subscriptions owned by component
lifecycle and allow unmounting to dispose external observations.
