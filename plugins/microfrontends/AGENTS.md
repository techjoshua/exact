# Using `@exactjs/microfrontends`

See the [README](./README.md) for host and remote setup. Use this package to compose independently
built eXact roots across an explicit microfrontend boundary.

- Keep host, remote, shared-context, and server-gateway ownership explicit.
- Load remote application components from compiler-produced artifacts.
- Pin remote entries with SRI metadata when the URL is not sufficient executable trust; preserve a
  generation-specific pin when resolving replacement builds.
- Keep page-authored child content under the page's original owner.
