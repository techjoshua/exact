import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderConnection } from './provider-connection.js';

it('reaps a provider that acknowledges shutdown but ignores termination', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-provider-lifetime-'));
	const entry = path.join(root, 'provider.mjs');
	await writeFile(
		entry,
		`process.on('SIGTERM',()=>{});setInterval(()=>{},1000);export function createExactLanguageAnalyzer(){return {diagnostics(){return [];},hover(){return {pid:process.pid};},dispose(){}};}`
	);
	const connection = new ProviderConnection(
		{
			key: 'fixture@1',
			id: 'fixture',
			version: '1',
			packageRoot: root,
			manifestPath: path.join(root, 'package.json'),
			entry,
			dataFiles: [],
			capabilities: ['hover'],
			projection: ['sourceText'],
			trust: 'all'
		},
		{ workspaceRoot: root },
		undefined
	);
	let pid: number | undefined;
	try {
		pid = (await connection.request<{ pid: number }>('hover', {}, 5000)).pid;
		const first = connection.dispose();
		expect(connection.dispose()).toBe(first);
		await first;
		expect(() => process.kill(pid!, 0)).toThrow();
	} finally {
		await connection.dispose();
		if (pid) {
			try {
				process.kill(pid, 'SIGKILL');
			} catch {}
		}
		await rm(root, { recursive: true, force: true });
	}
});
