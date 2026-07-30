# Using @exactjs/hydrate

Read this package's `README.md` and exported declarations before adopting server output. Hydrate
the same logical application that produced the HTML and choose mismatch recovery deliberately.

Prefer compiler-generated interaction hydration for eligible islands. Do not add handwritten
activation registries, replay logic, or eager hydration merely to reproduce behavior the compiler
already emits.

Validate distributed task results and invocation generations before applying effects. For
component registries, require matching compiler-owned registry, key, and entry identity. Recover a
nested mismatch inside its owned component range; do not remount an otherwise compatible root or
accept an authored display name as identity.

Carry the installed inspection owner through hydration and resumption domains. Correlate
continuation dispatch/apply and patch counts with opaque operation generations, but never retain
payloads or allow inspection to participate in stale-generation fencing, readiness, mutation
publication, or recovery decisions.
