import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname);
const typescriptCli = path.resolve(root, '../../node_modules/typescript/bin/tsc');

describe('microfrontend portal production build', () => {
	it.each(['page', 'billing', 'branding'])(
		'type-checks JSX and side-effect CSS imports in the %s Vite root',
		async (application) => {
			await execute(
				process.execPath,
				[
					typescriptCli,
					'--noEmit',
					'--noUncheckedSideEffectImports',
					'-p',
					path.join(root, application, 'tsconfig.json')
				],
				{ cwd: root }
			);
		}
	);

	it('emits one page deployment with independently built remote artifacts', async () => {
		await execute(process.execPath, ['scripts/build.mjs'], { cwd: root, timeout: 60_000 });
		const html = await readFile(path.join(root, 'dist', 'public', 'index.html'), 'utf8');
		const files = await recursiveFiles(path.join(root, 'dist', 'public'));
		const programs = await Promise.all(
			files
				.filter((file) => file.endsWith('.js'))
				.map((file) => readFile(path.join(root, 'dist', 'public', file), 'utf8'))
		);
		const styles = await Promise.all(
			files
				.filter((file) => file.endsWith('.css'))
				.map((file) => readFile(path.join(root, 'dist', 'public', file), 'utf8'))
		);
		const pageProgram = programs.join('\n');
		const emittedStyles = styles.join('\n');

		expect(html).toContain('id="app"');
		expect(
			files.some((file) => /remotes[\\/]billing[\\/].*exact-remote-Billing.*\.js$/i.test(file))
		).toBe(true);
		expect(
			files.some((file) => /remotes[\\/]branding[\\/].*exact-remote-Shell.*\.js$/i.test(file))
		).toBe(true);
		expect(
			files.some((file) =>
				/remotes[\\/]branding[\\/].*exact-remote-CompactShell.*\.js$/i.test(file)
			)
		).toBe(true);
		expect(
			files.some((file) => /remotes[\\/]billing[\\/].*exact-remote-Billing.*\.css$/i.test(file))
		).toBe(true);
		expect(
			files.some((file) =>
				/remotes[\\/]branding[\\/].*exact-remote-(?:Shell|CompactShell).*\.css$/i.test(file)
			)
		).toBe(true);
		expect(emittedStyles).toContain('.page-frame');
		expect(emittedStyles).toContain('.billing-card');
		expect(emittedStyles).toContain('.brand-shell');
		expect(pageProgram).toContain('/remotes/billing/');
		expect(pageProgram).toContain('/remotes/branding/');
		expect(pageProgram).not.toContain('localhost:4401');
		expect(pageProgram).not.toContain('localhost:4402');
		expect(await readFile(path.join(root, 'dist', 'server', 'start.js'), 'utf8')).toContain(
			'createSampleRuntimes'
		);
	}, 60_000);
});

async function recursiveFiles(rootDirectory: string, relative = ''): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(path.join(rootDirectory, relative), { withFileTypes: true })) {
		const next = path.join(relative, entry.name);
		if (entry.isDirectory()) files.push(...(await recursiveFiles(rootDirectory, next)));
		else files.push(next);
	}
	return files;
}
