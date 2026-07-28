import type { Component } from '@exactjs/core';
import { RemoteComponent } from '@exactjs/microfrontends/client';
import { PortalContext } from '@exactjs/sample-microfrontend-portal/shared';

/** Mounts the nested billing binding using the account selected by the page context. */
export function BillingSlot(this: Component<Record<string, never>>) {
	const portal = this.getContext(PortalContext);

	return () => (
		<RemoteComponent
			binding="billing"
			fallback={<p role="alert">The billing application is unavailable.</p>}
			props={{ accountId: portal.accountId }}
		/>
	);
}
