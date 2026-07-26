import { exact } from '@exactjs/vite-plugin';
import { exactPluginOptions } from './exact-options.mjs';

export default {
	base: './',
	plugins: [exact(exactPluginOptions)],
	server: {
		host: '0.0.0.0'
	}
};
