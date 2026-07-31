import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('shipping generated action boundary', () => {
	it('keeps transport access and server implementations out of component client source', async () => {
		const generated = path.resolve('.exact/components/workspace.exact.client.ts');
		const client = await readFile(generated, 'utf8');

		expect(client).toContain('dispatchComponentContinuation as __exactDispatchContinuation');
		expect(client).not.toContain('invokeAction');
		expect(client).not.toContain('exactClient');
		expect(client).not.toContain('route.resolve');
		expect(client).not.toMatch(/from ['"].*providers\/registry/);
		expect(client).not.toMatch(/from ['"].*geography/);
	});

	it('retains server implementations behind opaque generated continuation identities', async () => {
		const generated = path.resolve('.exact/components/workspace.exact.server.ts');
		const server = await readFile(generated, 'utf8');

		expect(server).toContain('markComponentContinuationAction');
		expect(server).toContain('quoteProvider');
		expect(server).toContain('resolveRoute');
		expect(server).not.toContain('route.resolve');
		expect(server).not.toContain('quote.doop');
	});
});
