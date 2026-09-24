import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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

it('reaps cancelled initialization before starting a replacement provider', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-provider-startup-'));
	const entry = path.join(root, 'provider.mjs');
	const marker = path.join(root, 'started');
	await writeFile(
		entry,
		`
import { existsSync, writeFileSync } from 'node:fs';
const first = !existsSync(${JSON.stringify(marker)});
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
export async function createExactLanguageAnalyzer() {
  if (first) {
    writeFileSync(${JSON.stringify(marker)}, String(process.pid));
    await new Promise(() => {});
  }
  return { hover() { return {pid: process.pid}; } };
}
`
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
	const pids: number[] = [];
	try {
		const controller = new AbortController();
		const pending = connection.request('hover', {}, 5000, controller.signal);
		const rejected = expect(pending).rejects.toThrow('cancel startup');
		await expect
			.poll(
				async () => {
					try {
						return Number(await readFile(marker, 'utf8'));
					} catch {
						return 0;
					}
				},
				{ timeout: 4000 }
			)
			.toBeGreaterThan(0);
		pids.push(Number(await readFile(marker, 'utf8')));
		controller.abort(new Error('cancel startup'));
		await rejected;
		pids.push((await connection.request<{ pid: number }>('hover', {}, 5000)).pid);
		expect(pids[1]).not.toBe(pids[0]);
		expect(() => process.kill(pids[0]!, 0)).toThrow();
		await connection.dispose();
		expect(() => process.kill(pids[1]!, 0)).toThrow();
	} finally {
		try {
			await connection.dispose();
		} finally {
			for (const pid of pids) {
				try {
					process.kill(pid, 'SIGKILL');
				} catch {}
			}
			await rm(root, { recursive: true, force: true });
		}
	}
});
