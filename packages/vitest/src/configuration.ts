import type { ExactPluginOptions } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { PluginOption } from 'vite';

/** Configures the compiler and matcher behavior contributed to Vitest. */
export type ExactVitestOptions = {
	compiler?: ExactPluginOptions;
	matchers?: boolean;
};

/**
 * Creates the eXact plugins for a Vitest configuration.
 *
 * Add the returned value to `plugins`. Vite accepts nested plugin arrays.
 */
export function exactVitest(options: ExactVitestOptions = {}): PluginOption[] {
	const plugins: PluginOption[] = [
		// Runtime helper imports must not load the compiler's native build tools in jsdom.
		// Vite resolves promised plugins while configuring its owning Node process.
		import('@exactjs/vite-plugin').then(({ exact }) =>
			exact({
				...options.compiler,
				serverExecutionReason: 'server-test'
			})
		)
	];
	const setupFile = fileURLToPath(new URL('./setup.js', import.meta.url));
	plugins.push({
		name: 'exact-vitest-runtime',
		async config(config) {
			const { applicationExactComponentLibraryRoots } = await import(
				'@exactjs/compiler/adapter-support'
			);
			const roots = await applicationExactComponentLibraryRoots(
				path.resolve(config.root ?? process.cwd())
			);
			const libraries = roots.map(
				(root) =>
					new RegExp(
						'^' +
							root
								.split(/[\\/]/u)
								.map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
								.join('[\\\\/]') +
							'[\\\\/]'
					)
			);
			return {
				test: {
					// Installed dependencies otherwise execute through Node while authored modules use
					// Vite, creating separate runtime instances and inconsistent export conditions.
					server: { deps: { inline: [/@exactjs[\\/]/, ...libraries] } },
					...(options.matchers !== false ? { setupFiles: [setupFile] } : {})
				}
			} as never;
		}
	});
	return plugins;
}
