# Routing and testing

## Routing

Use `@exactjs/router` when the application already adopts the native eXact router. Define routes
with component references and render nested children through `Outlet`:

```tsx
import { Link, Outlet, Route, Router } from '@exactjs/router';

function Layout() {
	return () => (
		<>
			<nav>
				<Link to="/">Home</Link>
			</nav>
			<Outlet />
		</>
	);
}

function App() {
	return () => (
		<Router>
			<Route component={Layout}>
				<Route path="/" component={Home} />
				<Route path="/projects/:id" component={Project} />
			</Route>
		</Router>
	);
}
```

Inspect nearby routes before choosing history, hash, memory, or request-backed location behavior.
Keep not-found routes last and scoped to the intended router.

## Forms

Use `@exactjs/forms` for accessible field composition and validation when present. Keep application
values in component state; the forms package composes control behavior, labels, help, feedback,
and submission rather than becoming a second state owner.

## Component tests

Use `@exactjs/testing` to mount through the real DOM renderer and access the framework instance.
Prefer user-visible queries and events for behavioral assertions, while using exposed component
state when a test genuinely needs to inspect or diagnose state.

Follow the runner integration already configured by the project. For new configurations, prefer:

- `@exactjs/vitest` for compiler setup, Vite 5–8 JSX configuration, automatic matcher
  installation, and the shared testing APIs.
- `@exactjs/jest` for automatic matcher setup, jsdom defaults, and the eXact TypeScript/TSX
  transformer.
- `@exactjs/bun-test` for Bun's native test runner, runtime compiler preload, Happy DOM setup,
  shared matchers, and the same component/server testing APIs.

Use the lower-level `@exactjs/testing/vitest` and `@exactjs/testing/jest` entrypoints only when the
runner configuration is intentionally managed elsewhere. Do not introduce React Testing Library
assumptions unless the component is intentionally running through the React compatibility layer.

### Server and paired tests

Use `testServerComponent()` with the compiled `.exact.server` export when a test needs to prove
server behavior. Configure component, application, and request contexts with their corresponding
builder methods. Inspect `view.html`, server state and props, component ancestry,
`context(token)`, and `providedContext(token)`. Do not test server placement by mounting the
unsplit source component in jsdom.

Use `mountClientServerTest()` when behavior crosses the client/server boundary. Supply hydratable
server output, the generated client-island registry, and the application's real eXact request
handler. Trigger behavior through accessible DOM interactions, then inspect
`view.protocol.exchanges` for the request, response, and client patch disposition.

Treat generated action and boundary IDs as opaque. Do not derive them from or couple tests to
compiler analysis. A test should normally cause the generated client code to issue an operation
and then assert against the recorded exchange. Paired views also expose hydrated component state,
inherited contexts, and contexts provided to descendants through `view.component(...)`.

For Bun tests, prefer the packaged preload:

```toml
[test]
preload = ["@exactjs/bun-test/preload"]
```

Import `describe`, `it`, and `expect` from `bun:test`, and import eXact helpers from
`@exactjs/bun-test`. Use `configureExactBunTest()` from a project-owned preload only when compiler,
DOM, or matcher configuration needs customization.
