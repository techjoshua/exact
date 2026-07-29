# Using @exactjs/devtools-protocol

Read this package's README and exported declarations before exposing an inspection transport.
Validate every request at the boundary and keep protocol version 1 read-only. Never reinterpret a
runtime, source, operation, component, or session ID as an invocation selector or authorization
capability.

Create value records with `previewExactValue()`. Apply secret, server-resource, and application
redaction before traversal; never serialize raw runtime instances, callbacks, request objects,
response bodies, or context resources. Keep collection results paginated and event histories
bounded.
