import {
	findExactConfig,
	loadExactConfig,
	type ExactLoadedConfig,
	type LoadExactConfigOptions
} from '@exactjs/config/node';
import path from 'node:path';

/** One build owner's configuration snapshot and its implicit source dependencies. */
export interface ExactBuildConfiguration {
	/** Shares one load until invalidation. A superseded load cannot publish old configuration. */
	read(): Promise<ExactLoadedConfig>;
	/** Invalidates all configuration, or only when a changed path participates in discovery. */
	invalidate(filename?: string): boolean;
}

/** Keeps config-derived compiler inputs coherent across watch generations in every build adapter. */
export function createExactBuildConfiguration(
	options: LoadExactConfigOptions
): ExactBuildConfiguration {
	let pending: Promise<ExactLoadedConfig> | undefined;
	let watchFiles: readonly string[] = [];
	const read = (): Promise<ExactLoadedConfig> => {
		if (pending) return pending;
		const next: Promise<ExactLoadedConfig> = loadExactConfig(options).then(
			(config) => {
				if (pending !== next) return read();
				watchFiles = config.watchFiles;
				return config;
			},
			(error) => {
				if (pending !== next) return read();
				pending = undefined;
				throw error;
			}
		);
		pending = next;
		return next;
	};
	return Object.freeze({
		read,
		invalidate(filename?: string) {
			if (filename) {
				const changed = path.resolve(filename);
				const selected = options.configPath
					? path.resolve(options.applicationRoot, options.configPath)
					: findExactConfig(options.applicationRoot);
				if (!watchFiles.includes(changed) && changed !== selected) return false;
			}
			pending = undefined;
			return true;
		}
	});
}
