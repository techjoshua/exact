import { createExactBuildConfiguration } from '@exactjs/compiler/adapter-support';
import type { ExactLoadedConfig } from '@exactjs/config/node';
import {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	type ExactPreparedPluginRegistry
} from '@exactjs/plugin-host/node';
import path from 'node:path';
import type { ExactPluginOptions } from './plugin-contracts.js';

/** Owns Vite's configuration and registry together so a watch change cannot mix generations. */
export class ExactViteConfiguration {
	/** Registry published by the latest completed preparation, absent after invalidation. */
	registry: ExactPreparedPluginRegistry | undefined;
	/** Configuration snapshot that produced the published registry. */
	loaded: ExactLoadedConfig | undefined;
	private readonly root: string;
	private readonly configuration;
	private readonly watchFiles = new Set<string>();
	private pending: Promise<ExactPreparedPluginRegistry> | undefined;

	/** Resolves configuration relative to the plugin application root. */
	constructor(options: ExactPluginOptions) {
		this.root = path.resolve(options.applicationRoot ?? process.cwd());
		this.configuration = createExactBuildConfiguration({
			applicationRoot: this.root,
			configPath: options.configPath
		});
	}

	/** Shares preparation and redirects superseded callers to the current registry. */
	read(): Promise<ExactPreparedPluginRegistry> {
		if (this.pending) return this.pending;
		const next: Promise<ExactPreparedPluginRegistry> = this.configuration
			.read()
			.then(async (loaded) => {
				const registry = await prepareExactPluginRegistry({
					applicationRoot: this.root,
					loadedConfig: loaded,
					hostMode: 'build'
				});
				if (this.pending !== next) return this.read();
				this.loaded = loaded;
				this.registry = registry;
				for (const file of registry.watchFiles) this.watchFiles.add(path.resolve(file));
				return registry;
			})
			.catch((error: unknown) => {
				if (this.pending !== next) return this.read();
				this.pending = undefined;
				throw error;
			});
		this.pending = next;
		return next;
	}

	/** Retains watched paths across invalidation because Vite reports one edit through several hooks. */
	invalidate(filename: string): boolean {
		if (!this.configuration.invalidate(filename) && !this.watchFiles.has(path.resolve(filename)))
			return false;
		this.configuration.invalidate();
		invalidateExactPluginRegistry(this.root);
		this.pending = undefined;
		this.registry = undefined;
		this.loaded = undefined;
		return true;
	}
}
