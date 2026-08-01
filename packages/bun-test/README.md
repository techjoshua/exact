# @exactjs/bun-test

Bun test-runner integration for eXact applications.

## Setup

Add the preload to `bunfig.toml`:

```toml
[test]
preload = ["@exactjs/bun-test/preload"]
```

Then import component-testing APIs from `@exactjs/bun-test`. The preload registers the eXact Bun
compiler plugin, installs Happy DOM when browser globals are absent, and adds the shared eXact
matchers to Bun's `expect`.

Use `configureExactBunTest()` for a custom preload, or import
`@exactjs/bun-test/setup` when compilation and DOM setup are handled elsewhere.
