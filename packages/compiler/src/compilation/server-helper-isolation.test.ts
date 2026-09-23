import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('excludes a server task helper before browser evaluation while retaining shared imports', async () => {
	const root = await createTestWorkspace('.exact-server-helper-', process.cwd());
	const files = await writeTestFiles(root, {
		'server-helper.ts': `import { createHash } from 'node:crypto'; export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }`,
		'shared.ts': `export const label = 'Shared label';`,
		'page.tsx': `import { TaskContext, type Component } from '@exactjs/core';
			import { digest } from './server-helper.js';
			import { label } from './shared.js';
			export function Page(this: Component<{value: string}>) {
				this.state.value = '';
				async function load(task: TaskContext = TaskContext.server()) { return digest('input'); }
				return () => <button onClick={async () => { this.state.value = await load(); }}>{label}:{this.state.value}</button>;
			}`
	});
	const compiled = await compileFileArtifacts(files['page.tsx']!, {
		rootDir: root,
		outDir: root
	});
	const client = await readFile(compiled.clientFile, 'utf8');
	expect(client).not.toContain('server-helper');
	expect(client).not.toContain('node:crypto');
	expect(client).toContain('./shared.js');
	const bundled = await build({
		entryPoints: [compiled.clientFile],
		bundle: true,
		write: false,
		platform: 'browser',
		format: 'esm',
		packages: 'external',
		metafile: true
	});
	expect(Object.keys(bundled.metafile!.inputs).some((name) => name.endsWith('shared.ts'))).toBe(
		true
	);
	expect(
		Object.keys(bundled.metafile!.inputs).some((name) => path.basename(name) === 'server-helper.ts')
	).toBe(false);
});
