import { expect, it } from 'vitest';
import { createWebpackEnhancementResolver } from './enhancement-provider-resolution.js';
import type { WebpackCompilerLike } from './plugin.js';

it('uses owning host options and distinguishes absent providers from operational failures', () => {
	const requests: unknown[] = [];
	let outcome: string | false | Error = '/source/provider.tsx';
	const compiler = {
		options: {},
		resolverFactory: {
			get: (kind: string, options: unknown) => {
				requests.push(kind, options);
				return {
					resolveSync: (_context: object, basedir: string, request: string) => {
						requests.push(basedir, request);
						if (outcome instanceof Error) throw outcome;
						return outcome;
					}
				};
			},
			hooks: { resolver: { for: () => ({ tap: () => {} }) } }
		}
	} satisfies WebpackCompilerLike;
	const resolve = createWebpackEnhancementResolver(compiler);
	expect(resolve('./provider.js', '/source/page.tsx')).toBe('/source/provider.tsx');
	expect(requests).toEqual([
		'normal',
		{ dependencyType: 'esm', useSyncFileSystemCalls: true },
		'/source',
		'./provider.js'
	]);
	outcome = false;
	expect(resolve('./provider.js', '/source/page.tsx')).toBeUndefined();
	outcome = new Error("Can't resolve './provider.js' in '/source'");
	expect(resolve('./provider.js', '/source/page.tsx')).toBeUndefined();
	outcome = new Error('filesystem access failure');
	expect(() => resolve('./provider.js', '/source/page.tsx')).toThrow('filesystem access failure');
	expect(
		createWebpackEnhancementResolver({ options: {} })('./provider.js', '/source/page.tsx')
	).toBeUndefined();
});
