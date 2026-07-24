# @exactjs/react-dom-compat

Compatibility implementation of `react-dom`, `react-dom/client`, `react-dom/server`, and related
entrypoints on top of eXact.

The package supports roots, hydration, portals, server rendering and streaming, resource hints,
error callbacks, batching, and package-export facades used by the React compatibility build.

Applications normally receive this package through automatic substitution configured by an eXact
build plugin. Import it directly only when deliberately targeting the compatibility API.
