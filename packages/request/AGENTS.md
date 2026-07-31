# Agent guidance for `@exactjs/request`

Read this package's `README.md` before changing request propagation. Keep public-origin authority
explicit and install ambient storage only at the runtime adapter boundary. `RequestProvider` is a
compilerless native framework component; preserve its stable `@exactjs/request:RequestProvider`
brand and do not replace it with function-name or shape-based identity.
