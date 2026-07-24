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

Use the lower-level `@exactjs/testing/vitest` and `@exactjs/testing/jest` entrypoints only when the
runner configuration is intentionally managed elsewhere. Do not introduce React Testing Library
assumptions unless the component is intentionally running through the React compatibility layer.
