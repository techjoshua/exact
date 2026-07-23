import { exact } from '@exactjs/vite-plugin';

export default {
	base: './',
	plugins: [exact()],
	server: {
		host: '0.0.0.0'
	}
};
