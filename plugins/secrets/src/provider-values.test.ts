import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import {
	verifyEnvironmentProviderOwnership,
	verifySecretContextOwnership
} from '../../../packages/component-composition-corpus/test-support/secret-provider-ownership-journey.mjs';
import { environmentSecrets } from './providers.js';
import createSecretsServerExtension, { createSecretResolver } from './server.js';

it('retains provider dictionary names, aliases and captured cancellation', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-provider-values-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	expect(
		await verifyEnvironmentProviderOwnership(
			{ environmentSecrets, createSecretResolver, createSecretsServerExtension },
			root
		)
	).toBe(true);
});

it('retains inherited provider metadata and initialization source ownership', async () => {
	expect(await verifySecretContextOwnership({ createSecretResolver })).toBe(true);
});
