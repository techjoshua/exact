/** Renders page-owned navigation that may be embedded beneath a remote shell. */
export function Navigation() {
	return () => (
		<nav class="portal-navigation" data-owner="page">
			<a href="#overview">Overview</a>
			<a href="#billing">Billing</a>
		</nav>
	);
}
