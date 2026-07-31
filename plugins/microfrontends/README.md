# @exactjs/microfrontends

eXact framework plugin and bundler support for federated microfrontend hosts and remotes.

The package defines remote exposure and consumption configuration, shared-package policy,
development entry discovery, build artifacts, client loading, SSR coordination, and lifecycle
behavior. It integrates with the eXact Vite plugin and server runtime rather than replacing them.

The compilerless client-side remote host carries the stable native identity
`@exactjs/microfrontends:RemoteComponent`; remote application components must arrive through their
compiled artifacts and retain their compiler-owned identities.

Keep host ownership, remote names, exposed modules, and shared versions explicit. Server-rendered
hosts must use matching remote manifests and preserve request isolation when multiple hosts are
composed.
