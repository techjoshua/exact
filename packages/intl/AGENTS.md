# @exactjs/intl guidance

Use this package when application-owned prose or formatted values need locale-aware rendering while
remaining meaningful without the optional intl enhancement. Prefer marked lexical message regions,
plain authored fallbacks, and one root `IntlProvider`. Do not construct prepared activations or
protocol descriptors in application code; those are analyzer-owned. Keep ordinary component
implementations outside enclosing messages unless a named `intl:fragment` intentionally exposes an
opaque exactly-once range. See the package README and framework internationalization reference.
Use ordinary native `Intl` syntax inside compiled components; use the cache-backed `intl` export
from `@exactjs/core` in non-component helpers that construct formatters directly.
Prefer one `scope: 'package'` enhancement namespace export in `exact.config.*` when every package component
should receive intl authoring diagnostics; use a local attributed import for narrower opt-in.
