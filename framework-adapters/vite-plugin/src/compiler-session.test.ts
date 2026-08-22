import { describe, expect, it } from 'vitest';
import type { ExactCompilerSession } from '@exactjs/compiler';
import { ExactViteCompilerSession, withExactViteBuildCompilerScope } from './compiler-session.js';

describe('paired Vite compiler ownership', () => {
	it('shares one native session until the complete build scope settles', async () => {
		let shared: ReturnType<ExactCompilerSession['stats']> | undefined;
		let nativeSession: ExactCompilerSession | undefined;

		await withExactViteBuildCompilerScope(async () => {
			const client = new ExactViteCompilerSession(false, undefined);
			const server = new ExactViteCompilerSession(false, undefined);
			nativeSession = client.current;
			expect(server.current).toBe(nativeSession);
			shared = server.current.stats();

			client.dispose();
			expect(() => client.current).toThrow('disposed');
			expect(server.current.hasNativeCompiler()).toBe(true);
			server.dispose();
		});

		expect(shared).toMatchObject({ workspaces: 1 });
		expect(() => nativeSession!.hasNativeCompiler()).toThrow('disposed');
	});
});
