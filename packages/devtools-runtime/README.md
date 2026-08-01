# @exactjs/devtools-runtime

Optional browser bridge between an eXact application and DevTools clients.

## Usage

Build integrations install this runtime automatically when browser inspection instrumentation is
enabled. Custom integrations can call `installExactDevtoolsRuntime()` and dispose the returned
installation with the application root.

The runtime combines renderer inspection, compiler source correlation, bounded event history, and
optional authorized server data behind the versioned eXact page hook.

## Deployment

Client-only applications can open a local inspection session without a server endpoint.
Server-backed inspection activates only when an endpoint is explicitly supplied or present in
compiler-generated hydration data.

Hardened builds should omit this package and disable both inspection catalog output and browser
runtime instrumentation.
