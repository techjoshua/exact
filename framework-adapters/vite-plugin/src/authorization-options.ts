import type { ExactPluginOptions } from './plugin-contracts.js';

/** Creates the request-scoped inputs used while authorizing resolved component artifacts. */
export function createExactViteAuthorizationOptions(
	options: ExactPluginOptions,
	applicationRoot: string,
	watch: (file: string) => void
) {
	return {
		applicationRoot,
		executionReason: options.serverExecutionReason,
		watch
	};
}
