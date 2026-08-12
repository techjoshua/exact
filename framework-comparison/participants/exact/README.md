# eXact controlled-service participant

This participant implements the incident console with one durable eXact application instance. Queue state is
stored directly on the instance, derived filters remain compiler-observed expressions, and accepted service
events replace only their corresponding incident. Detail interaction state belongs to the detail component.

It remains `scaffolded` because this slice uses browser rendering rather than adopting server-rendered HTML.
Its controlled-service behavior is covered by the shared black-box tests.
