import { isExactOptionalEnhancementPackageAbsent } from '@exactjs/compiler/adapter-support';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BunBuildLike } from './types.js';

// This private process resolves only. Its loaders replace entry/provider content before parsing,
// so module initialization and transitive imports cannot run ahead of component authorization.
for await (const line of createInterface({ input: process.stdin })) {
	const { id, request, directory, ...configuration } = JSON.parse(line) as {
		id: number;
		request: string;
		directory: string;
		[key: string]: unknown;
	};
	const entry = path.join(directory, `__exact_resolve_${randomUUID()}.js`);
	const runtime = globalThis as typeof globalThis & {
		Bun?: {
			build(
				options: Record<string, unknown>
			): Promise<{ success: boolean; logs: readonly unknown[] }>;
		};
	};
	if (!runtime.Bun) throw new Error('Bun runtime is required to resolve component providers');
	let resolved: string | undefined;
	try {
		const result = await runtime.Bun.build({
			...configuration,
			entrypoints: [entry],
			plugins: [
				{
					name: 'exact-provider-resolution',
					setup(probe: BunBuildLike) {
						probe.onResolve({ filter: /.*/ }, (args) =>
							args.path === entry ? { path: entry } : undefined
						);
						probe.onLoad({ filter: /.*/ }, (args) => {
							if (args.path === entry)
								return { contents: `import ${JSON.stringify(request)};`, loader: 'js' };
							resolved = args.path;
							return { contents: '', loader: 'js' };
						});
					}
				}
			]
		});
		if (!result.success) throw new AggregateError(result.logs, 'Bun provider resolution failed');
		console.log(JSON.stringify({ id, path: resolved }));
	} catch (error) {
		const failures: unknown[] = error instanceof AggregateError ? error.errors : [error];
		if (
			!failures.length ||
			!failures.every((failure) => String(failure).includes(`Could not resolve: "${request}"`)) ||
			!(await isExactOptionalEnhancementPackageAbsent(request, directory))
		)
			console.log(JSON.stringify({ id, error: String(error) }));
		else console.log(JSON.stringify({ id, missing: true }));
	}
}
