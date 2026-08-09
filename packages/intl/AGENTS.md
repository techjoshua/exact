# @exactjs/intl guidance

Use this package when application-owned prose or formatted values need locale-aware rendering while
remaining meaningful without the optional intl enhancement. Prefer marked lexical message regions,
plain authored fallbacks, and one root `IntlProvider`. Do not construct prepared activations or
protocol descriptors in application code; those are analyzer-owned. Keep ordinary component
implementations outside enclosing messages unless a named `intl:fragment` intentionally exposes an
opaque exactly-once range. See the package README and framework internationalization reference.
