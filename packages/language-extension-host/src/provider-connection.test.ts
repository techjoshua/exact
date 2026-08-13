import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExactLanguageProviderDescriptor } from './contracts.js';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn: spawnMock
}));

const { ProviderConnection } = await import('./provider-connection.js');

beforeEach(() => spawnMock.mockReset());

describe('provider process transport', () => {
	it('contains an EPIPE from a provider request pipe', async () => {
		const child = new EventEmitter() as EventEmitter & {
			stdin: Writable;
			stdout: PassThrough;
			stderr: PassThrough;
			killed: boolean;
			kill(): boolean;
		};
		child.stdin = new Writable({
			write(_chunk, _encoding, callback) {
				const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
				callback(error);
			}
		});
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.killed = false;
		child.kill = () => {
			child.killed = true;
			return true;
		};
		spawnMock.mockReturnValue(child);
		const connection = new ProviderConnection(
			descriptor,
			{ workspaceRoot: '/workspace' },
			undefined
		);

		await expect(connection.request('hover', {}, 1_000)).rejects.toThrow('write EPIPE');
		expect(connection.status()).toMatchObject({ health: 'failed', message: 'write EPIPE' });
		expect(child.killed).toBe(true);
		await connection.dispose();
	});
});

const descriptor: ExactLanguageProviderDescriptor = {
	key: '@fixture/provider@1.0.0',
	id: '@fixture/provider',
	version: '1.0.0',
	packageRoot: '/workspace/node_modules/@fixture/provider',
	manifestPath: '/workspace/node_modules/@fixture/provider/package.json',
	entry: '/workspace/node_modules/@fixture/provider/language.js',
	dataFiles: [],
	capabilities: ['hover'],
	projection: ['sourceText'],
	trust: 'all'
};
