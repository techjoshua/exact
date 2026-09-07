import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ssrTransportFor, usesNativeBunServer } from '../src/ssr-benchmark-transport.mjs';

const participant = async (directory) =>
	JSON.parse(
		await readFile(
			new URL(`../participants/${directory}/participant.json`, import.meta.url),
			'utf8'
		)
	);

test('controlled participants declare native Bun transports', async () => {
	const exact = await participant('exact');
	const react = await participant('react');

	assert.equal(ssrTransportFor(exact, 'node'), 'node-http');
	assert.equal(ssrTransportFor(exact, 'bun'), 'bun-fetch');
	assert.equal(ssrTransportFor(react, 'bun'), 'bun-fetch');
	for (const id of ['sveltekit', 'nuxt', 'tanstack-start'])
		assert.equal(ssrTransportFor(await participant(id), 'bun'), 'bun-fetch');
	assert.equal(usesNativeBunServer(ssrTransportFor(exact, 'bun')), true);
	assert.equal(usesNativeBunServer(ssrTransportFor(react, 'bun')), true);
});

test('transport selection fails closed for missing or cross-runtime declarations', () => {
	assert.throws(
		() => ssrTransportFor({ id: 'missing', ssrTransports: {} }, 'bun'),
		/does not declare/
	);
	assert.throws(
		() => ssrTransportFor({ id: 'wrong', ssrTransports: { node: 'bun-fetch' } }, 'node'),
		/only on Bun/
	);
});
