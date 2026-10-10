import path from 'node:path';
import ts from 'typescript';
import { exactConfigSearchPaths } from '@exactjs/config/node';
import { buildLibrary, type LibraryBuildOptions } from './build.js';

/** One watch owner. Closing waits for the active transactional build and releases every watcher. */
export interface LibraryBuildWatcher {
	/** Settles after the initial build attempt. Recoverable failures are reported through onError. */
	ready: Promise<void>;
	/** Stops future builds and waits for the active build. Repeated calls are safe. */
	close(): Promise<void>;
}

/** Reports completed generations and recoverable build failures to the owning CLI or test. */
export interface LibraryBuildWatchReports {
	/** Runs after a completed output generation has been published. */
	onBuild?(): void;
	/** Receives a failed build while watching remains active for subsequent edits. */
	onError?(error: unknown): void;
}

/** Rebuilds library source and configuration changes serially, retaining the last successful output on failure. */
export function watchLibraryBuild(
	options: LibraryBuildOptions,
	reports: LibraryBuildWatchReports = {}
): LibraryBuildWatcher {
	const root = path.resolve(options.root ?? process.cwd());
	let closed = false;
	let queued = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let active: Promise<void> | undefined;
	const fileWatchers = new Map<string, ts.FileWatcher>();
	const changed = (filename: string) => {
		const relative = path.relative(root, filename);
		const sourcePath = relative === 'src' || relative.startsWith('src' + path.sep);
		// Asset publication belongs to the asset pipeline. JSON can change
		// TypeScript's imported value types and remains a compiler input.
		if (
			sourcePath &&
			!fileWatchers.has(filename) &&
			!/\.(?:[cm]?[jt]sx?|json)$/i.test(filename) &&
			!ts.sys.directoryExists(filename)
		)
			return;
		if (
			!fileWatchers.has(filename) &&
			!sourcePath &&
			relative !== 'package.json' &&
			!/^exact\.config\.[cm]?[jt]s$/.test(relative)
		)
			return;
		if (closed) return;
		queued = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			void drain();
		}, 40);
	};
	const refreshFiles = () => {
		const files = new Set<string>();
		const selected = path.resolve(root, options.project ?? 'tsconfig.json');
		files.add(selected);
		files.add(path.join(root, 'package.json'));
		// Discovery can select workspace configs, or switch to a newly created nearer file.
		for (const filename of exactConfigSearchPaths(root)) files.add(filename);
		for (const filename of ts.sys.readDirectory(path.join(root, 'src'), [
			'.ts',
			'.tsx',
			'.mts',
			'.cts',
			'.js',
			'.jsx',
			'.mjs',
			'.cjs',
			'.json'
		]))
			files.add(path.resolve(filename));
		ts.getParsedCommandLineOfConfigFile(
			selected,
			{},
			{
				...ts.sys,
				readFile(filename) {
					files.add(path.resolve(filename));
					return ts.sys.readFile(filename);
				},
				onUnRecoverableConfigFileDiagnostic() {}
			}
		);
		for (const [filename, watcher] of fileWatchers) {
			if (files.has(filename)) continue;
			watcher.close();
			fileWatchers.delete(filename);
		}
		for (const filename of files)
			if (!fileWatchers.has(filename))
				fileWatchers.set(filename, ts.sys.watchFile!(filename, changed, 250));
	};
	const drain = (): Promise<void> => {
		if (active) return active;
		active = (async () => {
			while (queued && !closed) {
				queued = false;
				try {
					refreshFiles();
					await buildLibrary(options);
					reports.onBuild?.();
				} catch (error) {
					reports.onError?.(error);
				}
			}
		})().finally(() => {
			active = undefined;
		});
		return active;
	};
	const directory = ts.sys.watchDirectory!(path.join(root, 'src'), changed, true, {
		synchronousWatchDirectory: true
	});
	queued = true;
	const ready = drain();
	return {
		ready,
		async close() {
			if (closed) {
				await active;
				return;
			}
			closed = true;
			if (timer) clearTimeout(timer);
			directory.close();
			for (const watcher of fileWatchers.values()) watcher.close();
			fileWatchers.clear();
			await active;
		}
	};
}
