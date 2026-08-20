import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { publishOutputTransaction } from './output-transaction.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
	);
});

describe('compiler output transaction', () => {
	it('removes earlier stage files when staging a later mutation fails', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'exact-output-transaction-'));
		temporaryDirectories.push(directory);
		const file = path.join(directory, 'page.client.js');
		const blocker = path.join(directory, 'blocker');
		await writeFile(blocker, 'not a directory');

		await expect(
			publishOutputTransaction([
				{ file, content: 'staged' },
				{ file: path.join(blocker, 'child.js'), content: 'cannot create this parent' }
			])
		).rejects.toThrow();
		expect(await readdir(directory)).toEqual(['blocker']);
	});

	it('serializes overlapping publications that target the same output', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'exact-output-transaction-'));
		temporaryDirectories.push(directory);
		const file = path.join(directory, 'page.client.js');
		await writeFile(file, 'old');
		let releaseFirst!: () => void;
		const firstPaused = new Promise<void>((resolve) => (releaseFirst = resolve));
		let firstEntered!: () => void;
		const entered = new Promise<void>((resolve) => (firstEntered = resolve));
		let secondMoves = 0;

		const first = publishOutputTransaction([{ file, content: 'first' }], {
			async rename(from, to) {
				firstEntered();
				await firstPaused;
				await rename(from, to);
			}
		});
		await entered;
		const second = publishOutputTransaction([{ file, content: 'second' }], {
			async rename(from, to) {
				secondMoves++;
				await rename(from, to);
			}
		});
		await Promise.resolve();
		expect(secondMoves).toBe(0);
		releaseFirst();
		await Promise.all([first, second]);

		expect(await readFile(file, 'utf8')).toBe('second');
		expect(await readdir(directory)).toEqual(['page.client.js']);
	});

	it('restores the complete prior generation when publication fails midway', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'exact-output-transaction-'));
		temporaryDirectories.push(directory);
		const clientFile = path.join(directory, 'page.client.js');
		const serverFile = path.join(directory, 'page.server.js');
		await writeFile(clientFile, 'old-client');
		await writeFile(serverFile, 'old-server');
		let moves = 0;

		await expect(
			publishOutputTransaction(
				[
					{ file: clientFile, content: 'new-client' },
					{ file: serverFile, content: 'new-server' }
				],
				{
					async rename(from, to) {
						moves++;
						if (moves === 4) throw new Error('synthetic publication failure');
						await rename(from, to);
					}
				}
			)
		).rejects.toThrow('synthetic publication failure');

		expect(await readFile(clientFile, 'utf8')).toBe('old-client');
		expect(await readFile(serverFile, 'utf8')).toBe('old-server');
		expect(await readdir(directory)).toEqual(['page.client.js', 'page.server.js']);
	});
});
