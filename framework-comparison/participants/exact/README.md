# eXact controlled-service participant

This participant implements the incident console with one durable eXact application instance. Queue state is
stored directly on the instance, derived filters remain compiler-observed expressions, and accepted service
events replace only their corresponding incident. Detail interaction state belongs to the detail component.

The server emits hydratable HTML and its compiler-owned resumption payload. The browser adopts that DOM
without replacing the application root; the shared black-box suite protects both the user behavior and
that root-adoption boundary. It remains `scaffolded` until the framework-specialist review is approved.
