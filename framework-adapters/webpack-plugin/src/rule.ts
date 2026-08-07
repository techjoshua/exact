import type { ExactWebpackPluginOptions } from './plugin.js';

/** Creates the Webpack pre-loader rule for eXact source transforms. */
export function createExactWebpackRule(
	options: ExactWebpackPluginOptions = {},
	sessionId?: string
): Record<string, unknown> {
	return {
		test: /\.[cm]?[jt]sx?$/,
		enforce: 'pre',
		type: 'javascript/auto',
		use: [
			{
				loader: '@exactjs/webpack-plugin/loader',
				options: { ...options, ...(sessionId ? { __exactSessionId: sessionId } : {}) }
			}
		]
	};
}
