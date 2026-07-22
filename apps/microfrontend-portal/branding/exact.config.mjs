export default {
	plugins: {
		microfrontends(config) {
			config.providedPackages.push('@exact/sample-microfrontend-portal/shared');
			config.exposes['./Shell'] = { component: './src/BrandShell.tsx' };
			config.exposes['./CompactShell'] = { component: './src/CompactShell.tsx' };
		}
	}
};
