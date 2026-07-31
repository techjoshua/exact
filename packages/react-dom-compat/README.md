# @exactjs/react-dom-compat

Compatibility implementation of `react-dom`, `react-dom/client`, `react-dom/server`, and related
entrypoints on top of eXact.

The package supports roots, hydration, portals, server rendering and streaming, resource hints,
error callbacks, batching, and package-export facades used by the React compatibility build.

Applications normally receive this package through automatic substitution configured by an eXact
build plugin. Import it directly only when deliberately targeting the compatibility API.

The client and server compatibility roots are compilerless native hosts with explicit stable
package identities. React component functions remain React-owned and unbranded; the compatibility
runtime wraps them in separately identified native adapters.

Compatibility Suspense delegates range ownership and retry to the native renderer. Urgent updates
may replace content with a fallback, while deferred transition updates retain committed content;
React Activity retains hidden DOM and Hook/class state instead of remounting the subtree.
