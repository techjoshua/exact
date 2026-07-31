# Agent guidance for `@exactjs/microfrontends`

Preserve explicit host and remote ownership across build, server, and client boundaries. Remote
application components must come from compiler-produced artifacts with their compiler-owned native
identity; do not infer ownership from function names or component shape.

Keep the compilerless `RemoteComponent` host branded with its stable
`@exactjs/microfrontends:RemoteComponent` identity. Do not use runtime branding to admit an
uncompiled remote application component.
