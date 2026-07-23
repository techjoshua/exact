import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createExactReactNodeLoader } from './node-loader.js';

const fixtureRoot = path.resolve(
	import.meta.dirname,
	'../../../framework-adapters/vite-plugin/test-fixtures/adapter-app'
);
const execFileAsync = promisify(execFile);

describe('Node React compatibility loader', () => {
	it('rewrites prepackaged ESM and CommonJS React references', async () => {
		const loader = createExactReactNodeLoader({ target: 18, cwd: fixtureRoot });
		const esm = loader.transform(
			'import React from "react"; export const view = React.createElement("p");',
			'file:///fixture.mjs'
		);
		expect(esm?.code).toContain('from "@exactjs/react-compat/react18"');
		const loaded = await loader.load('file:///fixture.cjs', { format: 'commonjs' }, async () => ({
			format: 'commonjs',
			source: 'module.exports = require("react");'
		}));
		expect(String(loaded.source)).toContain('require("@exactjs/react-compat/react18")');
	});

	it('passes unrelated and non-JavaScript loads through by identity', async () => {
		const loader = createExactReactNodeLoader({ target: 18, cwd: fixtureRoot });
		expect(loader.transform('export const value = 1', 'file:///fixture.mjs')).toBeNull();
		const result = { format: 'json', source: '{"react":true}' };
		expect(await loader.load('file:///fixture.json', { format: 'json' }, async () => result)).toBe(
			result
		);
	});

	it('registers through Node --import before application modules', async () => {
		const register = path.resolve(import.meta.dirname, '../dist/register.js');
		await expect(
			execFileAsync(
				process.execPath,
				['--import', pathToFileURL(register).href, path.join(fixtureRoot, 'node-entry.mjs')],
				{ cwd: fixtureRoot }
			)
		).resolves.toMatchObject({ stderr: '' });
	});
});
