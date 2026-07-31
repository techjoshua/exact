# Agent guidance for `@exactjs/testing`

Use the main package or the runner integrations for application component tests so authored eXact
components pass through the normal compiler. Import `@exactjs/testing/internal/fixtures` only in low-level
framework, renderer, SSR, or hydration tests that deliberately construct raw VNodes. Do not use
fixture branding to make application components bypass compilation or to admit foreign React or
Preact functions into the native renderer.
