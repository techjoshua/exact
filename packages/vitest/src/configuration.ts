import { exact, type ExactPluginOptions } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
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
		exact({
			...options.compiler,
			...(options.compiler?.target === 'server' ? { serverExecutionReason: 'server-test' } : {})
		})
	];
	const setupFile = fileURLToPath(new URL('./setup.js', import.meta.url));
	plugins.push({
		name: 'exact-vitest-runtime',
		config() {
			return {
				test: {
					// Installed dependencies otherwise execute through Node while authored modules use
					// Vite, creating separate runtime instances and inconsistent export conditions.
					server: { deps: { inline: [/@exactjs[\\/]/] } },
					...(options.matchers !== false ? { setupFiles: [setupFile] } : {})
				}
			} as never;
		}
	});
	return plugins;
}
