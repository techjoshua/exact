import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { environmentSecrets } from '@exactjs/secrets/providers';
import createSecretsServerExtension, { createSecretResolver } from '@exactjs/secrets/server';
import {
	verifyEnvironmentProviderOwnership,
	verifySecretContextOwnership
} from '../secret-provider-ownership-journey.mjs';

const root = path.resolve(process.argv[2]);
try {
	await mkdir(root, { recursive: true });
	await verifyEnvironmentProviderOwnership(
		{ environmentSecrets, createSecretResolver, createSecretsServerExtension },
		root
	);
	await verifySecretContextOwnership({ createSecretResolver });
	const controller = new AbortController();
	const context = { applicationRoot: root, environment: 'test', signal: controller.signal };
	const loaded = await environmentSecrets({ includeProcessEnvironment: false }).load(context);
	assert.equal(loaded.TOKEN, 'ready');
	assert.equal(loaded.EMPTY, '');
	const reason = new Error('cancelled provider');
	controller.abort(reason);
	await assert.rejects(
		environmentSecrets({ includeProcessEnvironment: false, files: [] }).load(context),
		(error) => error === reason
	);
	const pendingController = new AbortController();
	const pending = environmentSecrets({
		includeProcessEnvironment: false,
		files: ['missing.env']
	}).load({ ...context, signal: pendingController.signal });
	pendingController.abort(reason);
	await assert.rejects(pending, (error) => error === reason);
	console.log('Environment provider file, empty-value, and cancellation controls passed');
} finally {
	await rm(root, { recursive: true, force: true });
}
