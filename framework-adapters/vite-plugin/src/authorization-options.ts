import type { ExactViteComponentAuthorization } from './component-authorization.js';
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

/** Opens server authorization on the first development request after configuration is prepared. */
export function ensureExactViteServerAuthorization(
	owner: ExactViteComponentAuthorization,
	target: 'client' | 'server',
	command: 'build' | 'serve',
	options: Parameters<ExactViteComponentAuthorization['open']>[0] | undefined
): void {
	if (target === 'server' && command === 'serve' && !owner.active && options) owner.open(options);
}
