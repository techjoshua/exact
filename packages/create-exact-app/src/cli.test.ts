import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it, onTestFinished } from 'vitest';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

async function destination(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-scaffold-cli-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	return path.join(root, 'app');
}

it.each(['webpack', 'bun'])('rejects implicit %s SSR before later prompts', async (bundler) => {
	const directory = await destination();
	await expect(
		execFileAsync(
			process.execPath,
			[cliPath, directory, '--bundler', bundler, '--runtime', 'node'],
			{ timeout: 5000 }
		)
	).rejects.toMatchObject({
		code: 1,
		stdout: '',
		stderr: expect.stringContaining('--operations-only')
	});
	await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['webpack', 'bun'])('creates an explicitly transport-only %s project', async (bundler) => {
	const directory = await destination();
	const result = await execFileAsync(
		process.execPath,
		[
			cliPath,
			directory,
			'--bundler',
			bundler,
			'--runtime',
			'node',
			'--operations-only',
			'--yes',
			'--no-install',
			'--no-skill'
		],
		{ timeout: 5000 }
	);
	expect(result.stdout).toContain('Created app');
	const server = await readFile(path.join(directory, 'src/server.ts'), 'utf8');
	expect(server).toContain('createExactNodeHandler');
});

it.each(['browser', 'node'])(
	'--yes accepts the %s delivery default without prompting',
	async (runtime) => {
		const directory = await destination();
		const result = await execFileAsync(
			process.execPath,
			[cliPath, directory, '--runtime', runtime, '--yes', '--no-install', '--no-skill'],
			{ timeout: 5000 }
		);
		expect(result.stdout).toContain('Created app');
		expect(result.stdout).not.toContain('Choose');
		if (runtime === 'node') {
			expect(await readFile(path.join(directory, 'src/client.tsx'), 'utf8')).toContain('hydrate');
		}
	}
);
