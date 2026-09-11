import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ssrRenderMode, supportsSsrRenderMode } from '../src/ssr-render-mode.mjs';

test('rendering modes reject unknown or unavailable APIs instead of silently substituting', () => {
	for (const id of ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'])
		assert.equal(ssrRenderMode('string', id), 'string');
	for (const id of ['exact', 'react', 'tanstack-start'])
		assert.equal(ssrRenderMode('stream', id), 'stream');
	for (const id of ['sveltekit', 'nuxt']) {
		assert.equal(supportsSsrRenderMode(id, 'stream'), false);
		assert.throws(() => ssrRenderMode('stream', id), /no streaming renderer/);
	}
	assert.throws(() => ssrRenderMode('fast'), /Unknown SSR rendering mode/);
});
