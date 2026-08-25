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

test('eXact declares its native Bun transport while compatibility-only peers remain explicit', async () => {
	const exact = await participant('exact');
	const react = await participant('react');

	assert.equal(ssrTransportFor(exact, 'node'), 'node-http');
	assert.equal(ssrTransportFor(exact, 'bun'), 'bun-fetch');
	assert.equal(ssrTransportFor(react, 'bun'), 'node-http-compat');
	assert.equal(usesNativeBunServer(ssrTransportFor(exact, 'bun')), true);
	assert.equal(usesNativeBunServer(ssrTransportFor(react, 'bun')), false);
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
