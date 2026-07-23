export default {
	plugins: {
		microfrontends(config) {
			config.providedPackages.push('@exactjs/sample-microfrontend-portal/shared');
			config.exposes['./Shell'] = { component: './src/BrandShell.tsx' };
			config.exposes['./CompactShell'] = { component: './src/CompactShell.tsx' };
		}
	}
};
