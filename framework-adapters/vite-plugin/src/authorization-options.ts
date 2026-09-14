import type { ExactPluginOptions } from './plugin-contracts.js';

/** Keeps build warnings separate from development and test execution gates. */
export function createExactViteAuthorizationOptions(
	options: ExactPluginOptions,
	applicationRoot: string,
	host: { addWatchFile?(file: string): void; warn?(message: string): void },
	command: 'build' | 'serve'
) {
	return {
		applicationRoot,
		executionReason: options.serverExecutionReason,
		watch: (file: string) => host.addWatchFile?.(file),
		warn:
			command === 'build' && options.serverExecutionReason !== 'server-test'
				? (message: string) => host.warn?.(message)
				: undefined
	};
}
