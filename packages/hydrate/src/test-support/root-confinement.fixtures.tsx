import { withComponentDomain, type Child, type ComponentDomain } from '@exactjs/core';

function ConfinedLabel(props: { value: string }) {
	return () => <span data-exact-id="title">{props.value}</span>;
}

function ConfinedHost(props: { page: ComponentDomain; remote: ComponentDomain }) {
	return () => (
		<section>
			{withComponentDomain(props.page, () => (
				<ConfinedLabel value="Page" />
			))}
			{withComponentDomain(props.remote, () => (
				<ConfinedLabel value="Remote" />
			))}
		</section>
	);
}

function PageChild() {
	return () => <strong data-page-child="">Page</strong>;
}

function ForeignShell(props: { children?: Child | Child[] }) {
	return () => <section data-exact-id="shell">{props.children}</section>;
}

/** Creates a compiler-issued tree with colliding ids owned by two execution roots. */
export function confinedLabelsRoot(page: ComponentDomain, remote: ComponentDomain) {
	return <ConfinedHost page={page} remote={remote} />;
}

/** Creates a foreign-root shell around a compiler-issued page-owned child. */
export function foreignShellRoot(page: ComponentDomain, remote: ComponentDomain) {
	const pageChild = withComponentDomain(page, () => <PageChild />);
	return withComponentDomain(remote, () => <ForeignShell>{pageChild}</ForeignShell>);
}
