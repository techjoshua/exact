const remoteEntry = (port, exposure) =>
	`http://localhost:${port}/@id/virtual:exact-remote-entry/${Buffer.from(exposure).toString('base64url')}`;

export default {
	plugins: {
		microfrontends(config) {
			config.providedPackages.push('@exact/sample-microfrontend-portal/shared');
			config.remotes.branding = {
				clientEntry: process.env.EXACT_BRANDING_ENTRY ?? remoteEntry(4302, './Shell'),
				endpoint: process.env.EXACT_BRANDING_ENDPOINT ?? 'http://localhost:4402/__exact'
			};
			config.remotes.compactBranding = {
				clientEntry:
					process.env.EXACT_COMPACT_BRANDING_ENTRY ?? remoteEntry(4302, './CompactShell'),
				endpoint: process.env.EXACT_BRANDING_ENDPOINT ?? 'http://localhost:4402/__exact'
			};
			config.remotes.billing = {
				clientEntry: process.env.EXACT_BILLING_ENTRY ?? remoteEntry(4301, './Billing'),
				endpoint: process.env.EXACT_BILLING_ENDPOINT ?? 'http://localhost:4401/__exact'
			};
		}
	}
};
