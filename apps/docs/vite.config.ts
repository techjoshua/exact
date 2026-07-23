import { exact } from '@exact/vite-plugin';

export default {
	base: './',
	plugins: [exact()],
	server: {
		host: '0.0.0.0'
	}
};
