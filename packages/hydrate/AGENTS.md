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

Treat eager resumption adoption as a transaction. Checkpoint the ordered
resumption resolver before attempting DOM adoption and roll it back after a
failed attempt. Let only a compiler-identity-matched DOM adoption boundary
authorize component construction to consume a record; never let mismatched,
unused, or exhausted records affect routing or reactive client mounts. Accept only
validated generated invocation metadata from serialized hydration configuration.

Carry the installed inspection owner through hydration and resumption domains. Correlate
continuation dispatch/apply and patch counts with opaque operation generations, but never retain
payloads or allow inspection to participate in stale-generation fencing, readiness, mutation
publication, or recovery decisions.
