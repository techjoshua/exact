import { expect, it } from 'vitest';
import { renderToString } from './index.js';
import { renderAttrs, renderCompiledNativeAttribute } from './markup.js';
import { createOperation } from './test-support/native-operations.js';

it.each(['details', 'dialog'])(
	'records an initially open native %s for hydration dirty-state detection',
	async (tag) => {
		const result = await renderToString(createOperation(tag, { open: true }, 'Content'));
		expect(result.html).toContain('data-exact-ssr-open="true"');
	}
);

it.each(['details', 'dialog'])(
	'keeps one owned %s baseline when authored metadata disagrees',
	async (tag) => {
		const result = await renderToString(
			createOperation(tag, { 'data-exact-ssr-open': 'false', open: true }, 'Content')
		);
		expect(result.html.match(/data-exact-ssr-open=/g)).toHaveLength(1);
		expect(result.html).toContain('data-exact-ssr-open="true"');
	}
);

it.each(['details', 'dialog'])(
	'records the closed %s baseline without serializing open',
	async (tag) => {
		const result = await renderToString(createOperation(tag, { open: false }, 'Content'));
		expect(result.html).toContain('data-exact-ssr-open="false"');
		expect(result.html).not.toMatch(/\sopen(?:\s|=|>)/);
	}
);

it.each(['details', 'dialog'])('ignores uppercase authored %s baseline metadata', async (tag) => {
	const result = await renderToString(
		createOperation(tag, { 'DATA-EXACT-SSR-OPEN': 'false', open: true }, 'Content')
	);
	expect(result.html.match(/data-exact-ssr-open=/gi)).toHaveLength(1);
	expect(result.html).toContain('data-exact-ssr-open="true"');
});

it('retains ordinary metadata on a custom element', async () => {
	const result = await renderToString(
		createOperation('x-dialog', { 'data-exact-ssr-open': 'authored', open: true }, 'Content')
	);
	expect(result.html).toContain('data-exact-ssr-open="authored"');
	expect(result.html.match(/data-exact-ssr-open=/g)).toHaveLength(1);
});

it.each(['details', 'dialog'])('reads a bound %s open default once', (tag) => {
	let reads = 0;
	const props = {
		get open() {
			reads++;
			return reads === 1;
		},
		__exactBindToggle: () => {}
	};
	const html = renderAttrs(props, false, tag);
	expect(reads).toBe(1);
	expect(html).toContain('data-exact-ssr-open="true"');
	expect(html.match(/data-exact-ssr-open=/g)).toHaveLength(1);
	expect(html).toMatch(/\sopen(?:\s|$)/);
});

it.each(['details', 'dialog'])(
	'protects compiled %s baseline attributes from authored metadata',
	(tag) => {
		expect(
			renderCompiledNativeAttribute('false', 0, 'data-exact-ssr-open', 'data-exact-ssr-open', tag)
		).toBe('');
		expect(
			renderCompiledNativeAttribute('false', 0, 'DATA-EXACT-SSR-OPEN', 'DATA-EXACT-SSR-OPEN', tag)
		).toBe('');
		expect(renderCompiledNativeAttribute(true, 0, 'open', 'open', tag)).toContain(
			'data-exact-ssr-open="true"'
		);
		expect(renderCompiledNativeAttribute(false, 0, 'open', 'open', tag)).toBe(
			' data-exact-ssr-open="false"'
		);
	}
);

it.each([18, 19] as const)('preserves React %s attribute ownership', (version) => {
	const html = renderAttrs({ 'data-exact-ssr-open': 'authored', open: true }, version, 'dialog');
	expect(html).toContain('data-exact-ssr-open="authored"');
	expect(html.match(/data-exact-ssr-open=/g)).toHaveLength(1);
});

it.each(['details', 'dialog'])('treats nullable %s open defaults as closed', async (tag) => {
	for (const open of [null, undefined]) {
		const result = await renderToString(createOperation(tag, { open }, 'Content'));
		expect(result.html).toContain('data-exact-ssr-open="false"');
		expect(result.html).not.toMatch(/\sopen(?:\s|=|>)/);
	}
});
