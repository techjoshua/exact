import type { ExactCompilerSession } from '@exactjs/compiler';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ExactWebpackTransformResult } from './transform.js';

const bridgeKey = Symbol.for('@exactjs/webpack-loader-bridge');

/** Cross-module-instance state installed on Webpack's compiler and consumed by its loader context. */
export type ExactWebpackLoaderBridge = Readonly<{
	session: ExactCompilerSession;
	intl: IntlBuildCoordinator;
	intlReady(): Promise<void>;
	record(filename: string, source: string, result: ExactWebpackTransformResult): void;
}>;

/** Minimal compiler carrier shared by the plugin and Webpack loader runner. */
export type ExactWebpackLoaderBridgeCarrier = {
	[bridgeKey]?: ExactWebpackLoaderBridge;
};

/** Installs one compiler-owned bridge without relying on shared module globals. */
export function installExactWebpackLoaderBridge(
	compiler: ExactWebpackLoaderBridgeCarrier,
	bridge: ExactWebpackLoaderBridge
): void {
	compiler[bridgeKey] = bridge;
}

/** Reads the bridge from the concrete compiler that invoked one loader. */
export function exactWebpackLoaderBridge(
	compiler: ExactWebpackLoaderBridgeCarrier | undefined
): ExactWebpackLoaderBridge | undefined {
	return compiler?.[bridgeKey];
}

/** Removes a bridge when its compiler session is disposed. */
export function removeExactWebpackLoaderBridge(compiler: ExactWebpackLoaderBridgeCarrier): void {
	delete compiler[bridgeKey];
}
