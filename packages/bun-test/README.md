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

Run the suite with Bun's browser export condition so DOM-facing framework packages select their
compiled client artifacts:

```json
{
	"scripts": {
		"test": "bun --conditions=browser test"
	}
}
```

The preload cannot change export conditions for modules Bun resolves before executing it, so the
condition belongs on the Bun process rather than in preload code.

Use `configureExactBunTest()` for a custom preload, or import
`@exactjs/bun-test/setup` when compilation and DOM setup are handled elsewhere.
