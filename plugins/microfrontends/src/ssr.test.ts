import { renderToStringAsync } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { remotePlaceholderRoot } from './ssr.fixtures.js?exact-target=server';

describe('RemoteComponent server rendering', () => {
	it('emits the compiler-owned client boundary without executing the browser wrapper', async () => {
		const result = await renderToStringAsync(remotePlaceholderRoot(), { markers: false });

		expect(result.html).toMatch(
			/^<div data-exact-client-boundary="[^"]+" data-exact-client-name="RemoteComponent" /u
		);
		expect(result.html).toContain(
			'data-exact-client-props="{&quot;props&quot;:{&quot;binding&quot;:&quot;billing&quot;}}"'
		);
		expect(result.html).toMatch(/><\/div>$/u);
		expect(result.html).not.toContain('data-exact-remote=');
	});
});
