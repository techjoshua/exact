# @exactjs/router

Native routing for eXact applications, with compatibility entry points for supported React Router
versions.

## Usage

```tsx
<Router>
	<Route component={Layout}>
		<Route index component={Home} />
		<Route path="projects/:id" component={Project} />
	</Route>
</Router>
```

## What it provides

The native router includes browser, hash, memory, and request-backed locations; nested routes;
links and outlets; params; loaders and actions; fetchers; redirects; blockers; revalidation;
hydration data; and static rendering.

Navigation and form work started inside an eXact interaction participates in that interaction's
pending lifetime. Import the main package for native eXact code. React Router compatibility
entrypoints are selected by the React compatibility build integration.

The low-level `createExactRouter()` accepts an optional neutral `publication` coordinator. It
receives accepted navigation metadata after loaders and blockers settle and owns the timing around
the single authoritative state publication. The router does not depend on any visual-transition
package.

See [routing compatibility](../../docs/react-router-compatibility.md).
The package publishes inert component build facts for the consuming server bundler's
[component-library policy](../../docs/component-library-trust.md).
