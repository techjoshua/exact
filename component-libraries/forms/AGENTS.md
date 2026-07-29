# Using @exactjs/forms

Read this package's `README.md` and exported declarations before composing fields. Keep
application values and server validation errors in inspectable component state; form context owns
accessible relationships and validation coordination, not a second application-data store.

Treat `Form` as an interaction host. Preserve duplicate-submission suppression and keep busy,
pending, and disabled presentation active through validation, callback settlement, placed server
work, and router operations joined by that callback. Use `Submit` for coordinated pending text and
the `errors` prop for application-owned field messages.
