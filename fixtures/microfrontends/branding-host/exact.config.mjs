export default {
	plugins: {
		microfrontends(config) {
			config.exposes['./Shell'] = { component: './src/BrandShell.tsx' };
		}
	}
};
