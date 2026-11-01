import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { verifyPluginConfigurationValues } from '../../component-composition-corpus/test-support/plugin-configuration-journey.mjs';
import { discoverExactPlugins } from './discovery.js';
import { resolveExactPluginConfigurations } from './configuration.js';
import { importPublicPackageEntry } from './modules.js';

it('publishes ordinary config contexts and reports while preserving discovery and execution ownership', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-plugin-observations-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	expect(
		await verifyPluginConfigurationValues(
			{ discoverExactPlugins, resolveExactPluginConfigurations, importPublicPackageEntry },
			root
		)
	).toBe(true);
});

// These declarations remain readonly even though ordinary writable aliases are observable at runtime.
const checkContextTypes = (context: import('@exactjs/plugin-api').ExactPluginConfigContext) => {
	// @ts-expect-error Configuration context fields are readonly views.
	context.environment = 'changed';
	// @ts-expect-error Nested context metadata retains its readonly declaration.
	context.plugin.packageName = 'changed';
};
void checkContextTypes;
