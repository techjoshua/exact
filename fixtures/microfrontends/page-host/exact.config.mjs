export default {
	plugins: {
		microfrontends(config) {
			config.remotes.billing = {
				clientEntry: 'https://cdn.example.test/billing/exact-remote-Billing.js',
				endpoint: 'http://billing.internal/__exact'
			};
			config.remotes.branding = {
				clientEntry: 'https://cdn.example.test/branding/exact-remote-Shell.js',
				endpoint: 'http://branding.internal/__exact'
			};
		}
	}
};
