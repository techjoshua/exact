import type { FileSystem as NativeFileSystem } from '@typescript/native/unstable/fs';
import fs from 'node:fs';
import path from 'node:path';
import type { NativeChangeKind } from './native-snapshots.js';
import { displayFile, normalizeFile } from './syntax.js';

/** State exposed through the native compiler's overlay filesystem callbacks. */
export type NativeFileSystemOptions = Readonly<{
	nativeTsconfigPath: string;
	overlays: ReadonlyMap<string, string>;
	pendingChanges: ReadonlyMap<string, NativeChangeKind>;
	nativeConfigSource(): string;
}>;

/** Creates the overlay filesystem consumed by one native API process. */
export function createNativeFileSystem(options: NativeFileSystemOptions): NativeFileSystem {
	const nativeConfig = normalizeFile(options.nativeTsconfigPath);
	return {
		readFile: (filename) => {
			const normalized = normalizeFile(filename);
			if (normalized === nativeConfig) return options.nativeConfigSource();
			const overlay = options.overlays.get(normalized);
			if (overlay !== undefined) return overlay;
			return options.pendingChanges.get(normalized) === 'deleted' ? null : undefined;
		},
		fileExists: (filename) => {
			const normalized = normalizeFile(filename);
			if (normalized === nativeConfig) return true;
			if (options.overlays.has(normalized)) return true;
			return options.pendingChanges.get(normalized) === 'deleted' ? false : undefined;
		},
		directoryExists: (directory) => {
			const prefix = `${normalizeFile(directory)}/`;
			return [...options.overlays.keys()].some((filename) => filename.startsWith(prefix))
				? true
				: undefined;
		},
		getAccessibleEntries: (directory) => accessibleEntries(directory, options, nativeConfig),
		realpath: (candidate) => {
			try {
				return displayFile(fs.realpathSync.native(candidate));
			} catch {
				return undefined;
			}
		}
	};
}

function accessibleEntries(
	directory: string,
	options: NativeFileSystemOptions,
	nativeConfig: string
) {
	const normalized = normalizeFile(directory);
	const prefix = `${normalized}/`;
	const virtual = [...options.overlays.keys()].filter((filename) => filename.startsWith(prefix));
	if (!virtual.length && normalized !== normalizeFile(path.dirname(nativeConfig))) return undefined;
	const files = new Set<string>();
	const directories = new Set<string>();
	try {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) directories.add(entry.name);
			else files.add(entry.name);
		}
	} catch {
		// A purely virtual directory has no disk entries.
	}
	if (normalized === normalizeFile(path.dirname(nativeConfig)))
		files.add(path.basename(options.nativeTsconfigPath));
	for (const filename of virtual) {
		const relative = filename.slice(prefix.length);
		const separator = relative.indexOf('/');
		if (separator < 0) files.add(relative);
		else directories.add(relative.slice(0, separator));
	}
	return { files: [...files], directories: [...directories] };
}
