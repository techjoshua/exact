import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cli = path.resolve(import.meta.dirname, '../dist/cli.js');
const fixtureRoot = path.resolve(
	import.meta.dirname,
	'../../../framework-adapters/vite-plugin/test-fixtures/adapter-app'
);

describe('exact-reactc', { timeout: 15_000 }, () => {
	it('uses the shared registry for ahead-of-time compilation', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-reactc-'));
		const input = path.join(root, 'src', 'view.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'/** @jsxImportSource @exact/jsx */\nimport { QueryClientProvider } from "@tanstack/react-query";\nconst view = <QueryClientProvider client={client} />;'
		);
		await execFileAsync(process.execPath, [
			cli,
			'--compatibilityRoot',
			fixtureRoot,
			'--reactTarget',
			'18',
			'--rootDir',
			path.dirname(input),
			'--outDir',
			outDir,
			input
		]);
		expect(await readFile(path.join(outDir, 'view.ts'), 'utf8')).toContain(
			'from "@exact/tanstack-query/react"'
		);
	});
});
