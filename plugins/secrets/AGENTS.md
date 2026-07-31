# Using @exactjs/secrets

Read this package's README and exported declarations before configuring providers. Secret values
remain server-owned resources and must never enter compiler catalogs, hydration, client bundles,
DevTools previews, events, source excerpts, errors, audits, or exports.

When inspection is enabled, project only compiler-qualified secret names or presence and convert
them to redaction selectors before any value traversal. Do not reveal value length, shape, provider
metadata, or error text that could contain the value.
