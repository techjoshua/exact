import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsPackedWorkbench } from './packed-workbench-selection.mjs';

test('framework, packaging, and gate changes select installed acceptance', () => {
	for (const file of [
		'packages/dom/src/events.ts',
		'native/compiler.go',
		'framework-adapters/vite-plugin/src/index.ts',
		'plugins/microfrontends/src/client.ts',
		'react-adapters/redux/src/index.ts',
		'component-libraries/motion/src/index.ts',
		'scripts/packed-app-dependencies.mjs',
		'.github/workflows/native-compiler-packages.yml',
		'package-lock.json',
		'tsconfig.base.json'
	])
		assert.equal(needsPackedWorkbench([file]), true, file);
});
test('prose and unrelated application changes do not run the packed workbench', () => {
	assert.equal(
		needsPackedWorkbench(['docs/ssr-hydration.md', 'apps/docs/src/page.tsx', 'AGENTS.md']),
		false
	);
	assert.equal(needsPackedWorkbench([]), false);
});
