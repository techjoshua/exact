import { exact, type ExactPluginOptions } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import type { PluginOption } from 'vite';

export {
	exactMatchers,
	installVitestMatchers,
	type ExactMatcherDeclarations,
	type ExpectLike
} from '@exactjs/testing/vitest';
export * from '@exactjs/testing';

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
	const plugins: PluginOption[] = [exact(options.compiler)];
	if (options.matchers !== false) {
		const setupFile = fileURLToPath(new URL('./setup.js', import.meta.url));
		plugins.push({
			name: 'exact-vitest-matchers',
			config() {
				return {
					test: {
						setupFiles: [setupFile]
					}
				} as never;
			}
		});
	}
	return plugins;
}
