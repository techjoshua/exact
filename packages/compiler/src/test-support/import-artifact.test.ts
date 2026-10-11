import { expect, it, vi } from 'vitest';
import { importArtifact } from './import-artifact.js';

vi.mock('esbuild', () => {
	throw new Error('bundler initialization failed');
});

it('restores realm globals when artifact bundler initialization fails', async () => {
	const originalEncoder = globalThis.TextEncoder;
	const originalArray = globalThis.Uint8Array;
	class AuthoredEncoder extends originalEncoder {}
	globalThis.TextEncoder = AuthoredEncoder;
	try {
		await expect(importArtifact('unused.ts', 'unused.mjs')).rejects.toThrow();
		expect(globalThis.TextEncoder).toBe(AuthoredEncoder);
		expect(globalThis.Uint8Array).toBe(originalArray);
	} finally {
		globalThis.TextEncoder = originalEncoder;
		globalThis.Uint8Array = originalArray;
	}
});
