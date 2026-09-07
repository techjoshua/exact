import adapter from '@sveltejs/adapter-node';
import bunAdapter from 'svelte-adapter-bun';

export default {
	kit: {
		adapter:
			process.env.COMPARISON_BUILD_RUNTIME === 'bun'
				? bunAdapter({ out: 'build-bun' })
				: adapter({ out: 'build' })
	}
};
