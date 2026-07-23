export default {
	plugins: {
		microfrontends(config) {
			config.providedPackages.push('@exactjs/sample-microfrontend-portal/shared');
			config.exposes['./Billing'] = { component: './src/Billing.tsx' };
		}
	}
};
