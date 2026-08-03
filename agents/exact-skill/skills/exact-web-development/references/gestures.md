# Gestures

When an application installs `@exactjs/gestures`, read its package-local `AGENTS.md`, README, and
exported declarations before editing gesture behavior.

- Keep definitions prepared and stable; do not recreate recognizers during reactive updates.
- Keep application state authoritative and use semantic callbacks to mutate it normally.
- Provide keyboard parity for control-like gestures and preserve native browser behavior until a
  recognizer deliberately claims input.
- Let the package session own pointer capture, active listeners, cancellation, coalescing, and
  cleanup.
- Compose animation or simulation through callbacks or adapter packages, not base-package imports.
