import { API as NativeAPI } from '@typescript/native/unstable/sync';
import path from 'node:path';
import type { ExpressionProjectOptions } from './contracts.js';
import { createExpressionProjectHost } from './host.js';
import { createNativeFileSystem } from './native-filesystem.js';
import { nativeProjectFailure } from './native-operations.js';
import type { NativeChangeKind } from './native-snapshots.js';

/** Mutable host caches shared with a native expression project. */
export type NativeInitializationState = {
	overlays: Map<string, string>;
	overlayVersions: Map<string, number>;
	diskVersions: Map<string, string>;
	diskFileExistence: Map<string, boolean>;
	diskFileContents: Map<string, string | undefined>;
	pendingChanges: Map<string, NativeChangeKind>;
	nativeConfigSource(): string;
};

/** Creates and validates the native process and its shared project host. */
export function initializeNativeProject(
	options: ExpressionProjectOptions,
	state: NativeInitializationState
) {
	const host = createExpressionProjectHost(options, {
		overlays: state.overlays,
		overlayVersions: state.overlayVersions,
		diskVersions: state.diskVersions,
		diskFileExistence: state.diskFileExistence,
		diskFileContents: state.diskFileContents,
		sourceFiles: new Map()
	});
	const nativeTsconfigPath = path.join(
		path.dirname(host.tsconfigPath),
		'.exact-native-tsconfig.json'
	);
	const native = new NativeAPI({
		collectTiming: true,
		cwd: path.dirname(host.tsconfigPath),
		fs: createNativeFileSystem({
			nativeTsconfigPath,
			overlays: state.overlays,
			pendingChanges: state.pendingChanges,
			nativeConfigSource: state.nativeConfigSource
		})
	});
	try {
		native.parseConfigFile(host.tsconfigPath);
	} catch (error) {
		native.close();
		throw nativeProjectFailure('EXPR_NATIVE_CONFIGURATION', 'initialize', error);
	}
	return { host, native, nativeTsconfigPath };
}
