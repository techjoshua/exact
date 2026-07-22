export default {
	plugins: {
		microfrontends(config) {
			config.exposes['./Billing'] = { component: './src/Billing.tsx' };
		}
	}
};
