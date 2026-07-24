import { describe, expect, it } from 'vitest';
import { exactVitest } from './index.js';

describe('@exactjs/vitest', () => {
	it('configures the compiler, Vite 8 JSX runtime, and matcher setup', () => {
		const plugins = exactVitest();
		const compiler = plugins[0] as ReturnType<typeof exactVitest>[number] & {
			config(): Record<string, unknown>;
		};
		const matchers = plugins[1] as ReturnType<typeof exactVitest>[number] & {
			config(): { test: { setupFiles: string[] } };
		};

		expect(compiler.config()).toMatchObject({
			oxc: {
				jsx: {
					runtime: 'automatic',
					importSource: '@exactjs/jsx'
				}
			}
		});
		expect(matchers.config().test.setupFiles[0]).toMatch(/setup\.js$/);
	});

	it('allows automatic matcher installation to be disabled', () => {
		expect(exactVitest({ matchers: false })).toHaveLength(1);
	});
});
