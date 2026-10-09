import { expect, it } from 'vitest';
import { withOwnedNativeCompilationSession } from './native-session.js';
import type { ExactCompilerSession } from '../expression/project.js';

it.each([false, true])(
	'reuses a generation type graph and releases its owner after failure=%s',
	async (fail) => {
		let retained: ExactCompilerSession | undefined;
		const operation = withOwnedNativeCompilationSession(async (session) => {
			retained = session;
			const request = {
				kind: 'compile' as const,
				id: '/generation/model.ts',
				source: 'export const value: number = 1;',
				diagnostics: 'semantic' as const
			};
			const client = session.compileNative({ ...request, target: 'client' });
			await Promise.resolve();
			const server = session.compileNative({ ...request, target: 'server' });
			expect(client.diagnostics).toEqual([]);
			expect(server.diagnostics).toEqual([]);
			expect(server.cacheHit).toBe(true);
			if (fail) throw new Error('generation failed');
			return server.code;
		});
		if (fail) await expect(operation).rejects.toThrow('generation failed');
		else expect(await operation).toContain('export const value');
		expect(() => retained!.stats()).toThrow(/disposed/);
	}
);
