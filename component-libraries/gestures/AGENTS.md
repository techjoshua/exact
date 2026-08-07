# Using `@exactjs/gestures`

See the [README](./README.md) for setup and API orientation.

- Keep prepared definitions stable and application state authoritative.
- Provide keyboard behavior for control-like pointer gestures.
- Prefer the narrowest `touchAction` policy and do not disable document input globally.
- Let the component-owned session manage capture, cancellation, coalescing, and cleanup.
