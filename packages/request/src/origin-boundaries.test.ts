import { expect, it } from 'vitest';
import { createRequestContextValue } from './index.js';

it.each([undefined, 'https://shop.example.test'])(
	'retains the configured origin for authority-shaped pathnames (%s)',
	(publicOrigin) => {
		const value = createRequestContextValue({
			url: 'https://untrusted.example//attacker.example/orders?open=1',
			publicOrigin
		});
		expect(value.url.origin).toBe(publicOrigin ?? 'http://exact.invalid');
		expect(value.url.pathname).toBe('//attacker.example/orders');
		expect(value.url.search).toBe('?open=1');
	}
);

it.each([
	'/orders?open=1',
	'https://untrusted.example///attacker.example/orders?open=1',
	'https://untrusted.example/%2f%2fattacker.example/orders?open=1',
	new URL('https://untrusted.example//attacker.example/orders?open=1#discard')
])('preserves parsed path and query without authority or fragment propagation: %s', (input) => {
	const supplied = new URL(input, 'http://exact.invalid');
	const value = createRequestContextValue({
		url: input,
		publicOrigin: new URL('https://shop.example.test')
	});
	expect(value.url.origin).toBe('https://shop.example.test');
	expect(value.url.pathname).toBe(supplied.pathname);
	expect(value.url.search).toBe(supplied.search);
	expect(value.url.hash).toBe('');
	expect(value.publicOrigin?.href).toBe('https://shop.example.test/');
});

it.each([
	'ftp://example.test',
	'https://user:password@example.test',
	'https://example.test/path',
	'https://example.test?query=1',
	'https://example.test#fragment'
])('rejects an untrusted public origin configuration: %s', (publicOrigin) => {
	expect(() => createRequestContextValue({ url: '/orders', publicOrigin })).toThrow(/publicOrigin/);
});
