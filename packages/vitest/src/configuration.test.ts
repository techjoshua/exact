import { describe, expect, it } from 'vitest';
import { exactVitest } from './index.js';

describe('@exactjs/vitest', () => {
	it('configures the compiler, Vite 8 JSX runtime, and matcher setup', async () => {
		const plugins = exactVitest();
		const compiler = (await plugins[0]) as ReturnType<typeof exactVitest>[number] & {
			config(): Record<string, unknown>;
		};
		const matchers = plugins[1] as ReturnType<typeof exactVitest>[number] & {
			config(config: {}): Promise<{ test: { setupFiles: string[] } }>;
		};

		expect(compiler.config()).toMatchObject({
			oxc: {
				jsx: {
					runtime: 'automatic',
					importSource: '@exactjs/jsx'
				}
			}
		});
		expect((await matchers.config({})).test.setupFiles[0]).toMatch(/setup\.js$/);
	});

	it('allows automatic matcher installation to be disabled', async () => {
		const integration = exactVitest({ matchers: false })[1] as ReturnType<
			typeof exactVitest
		>[number] & {
			config(config: {}): Promise<{
				test: { setupFiles?: string[]; server: { deps: { inline: RegExp[] } } };
			}>;
		};
		const configuration = (await integration.config({})).test;
		expect(configuration.setupFiles).toBeUndefined();
		expect(
			configuration.server.deps.inline[0]!.test('/app/node_modules/@exactjs/core/dist/index.js')
		).toBe(true);
		expect(
			configuration.server.deps.inline[0]!.test(
				'C:\\app\\node_modules\\@exactjs\\core\\dist\\index.js'
			)
		).toBe(true);
	});
});
