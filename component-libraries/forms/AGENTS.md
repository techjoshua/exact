# Using @exactjs/forms

Read this package's `README.md` and exported declarations before composing fields. Keep
application values and server validation errors in inspectable component state; form context owns
accessible relationships and validation coordination, not a second application-data store.

Treat `Form` as an interaction host. Preserve duplicate-submission suppression and keep busy,
pending, and disabled presentation active through validation, callback settlement, placed server
work, and router operations joined by that callback. The host must begin an
interaction-activated root task frame so invoked task descendants contribute
to structural settlement. Use `Submit` for coordinated pending text and the
`errors` prop for application-owned field messages.

Keep prop destructuring and accessibility/validation derivation in setup. A
returned render function must contain only the JSX view expression; do not add
declarations or imperative branches to library renders.

Keep every compilerless native form component branded through `markExactComponent()` with a
stable `@exactjs/forms:` identity. Never rely on its function name or shape for renderer ownership.
Put authored test components in the compiler-included fixture module used by the package's
`@exactjs/vitest` configuration; do not brand application-shaped test components manually or
compile Vitest's top-level registration calls as application initialization.
