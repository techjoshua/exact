# Maintaining the microfrontend portal sample

Preserve the ownership split between the page, branding, and billing roots. The page owns the
reactive `PortalContext`; remote components consume that shared token while retaining their own
local component state and lifecycle.

Use `RemoteComponent` for finite configured exposures and keep page-authored child slots under
their original owner. Do not duplicate the shared core/context module, leak private host URLs into
browser artifacts, craft protocol operations in components, or bypass the page gateway for server
work.

Run `npm run test:microfrontends` and `npm run build:microfrontends` after component or federation
changes.
