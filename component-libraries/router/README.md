# @exactjs/router

Native eXact routing with history, hash, memory, and request-backed location sources. It supports
declarative nested routes, links, outlets, navigation, params, loaders, actions, fetchers,
hydration data, and static rendering.

```tsx
<Router>
	<Route component={Layout}>
		<Route index component={Home} />
		<Route path="projects/:id" component={Project} />
	</Route>
</Router>
```

Native navigation, fetcher, submission, and revalidation promises join the synchronously active
event, form, or action interaction. The initiating host therefore remains pending through route
loaders and commit, while the router retains latest-wins navigation, redirects, blockers, and
stale-result rejection.

The package also exposes React Router compatibility facades for supported React Router 5, 6, and
7 package substitutions. Native eXact applications should import the main entrypoint; compatibility
entrypoints are selected by the React compatibility build integration.

See [Actions, interactions, optimistic state, and forms](../../docs/actions-and-forms.md).
