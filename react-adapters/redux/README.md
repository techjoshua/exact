# @exactjs/redux

eXact adapter for Redux stores.

The package connects store selection and dispatch to component lifecycle and fine-grained
reactivity, and declares supported React Redux substitutions for compatibility builds.

Selectors should be stable and side-effect free. The adapter unsubscribes component-owned
observers on unmount; the Redux store itself remains owned by the application.
