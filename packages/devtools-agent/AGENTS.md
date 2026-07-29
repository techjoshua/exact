# Using @exactjs/devtools-agent

Attach to a Chromium target the operator already controls and use only the exported read-only query
service. Validate every request before it crosses CDP. Never add an API that evaluates
caller-provided JavaScript, invokes component work, mutates page state, forwards browser
credentials, overrides redaction, or extends a server session.

Always call `disconnect()` in cleanup. It removes the CDP binding, closes subscriptions, releases
remote object ownership, and closes the transport.
