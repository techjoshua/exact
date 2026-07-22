import { createContext, type Component } from '@exact/core';
import { render } from '@exact/dom';
import { RemoteComponent } from '@exact/microfrontends/client';

export const Theme = createContext<string>('fixture-theme', { global: true });

function Navigation() {
	return () => <nav data-page-owner="navigation">Accounts</nav>;
}

function AccountMenu() {
	return () => <button data-page-owner="account">Ada</button>;
}

function BillingContent() {
	return () => <RemoteComponent binding="billing" fallback={<p>Billing unavailable</p>} />;
}

function Page(this: Component<Record<string, never>>) {
	this.setContext(Theme, 'light');
	return () => (
		<RemoteComponent
			binding="branding"
			fallback={<p>Brand shell unavailable</p>}
			props={{
				navigation: <Navigation />,
				content: <BillingContent />,
				account: <AccountMenu />
			}}
		/>
	);
}

render(<Page />, document.getElementById('app')!);
