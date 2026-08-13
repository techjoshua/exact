import { loadExactConfig } from '@exactjs/config/node';
import { prepareExactPluginRegistry } from '@exactjs/plugin-host/node';
import path from 'node:path';
import { exact, type BunPluginLike, type ExactBunPluginOptions } from './plugin.js';

type RemoteAdapter = ReturnType<
	(typeof import('@exactjs/microfrontends/bun'))['createExactRemoteBunAdapter']
>;

/** Internal remote generation passed from exactBuild() into the Bun plugin lifecycle. */
export type ExactPreparedBunRemoteBuild = Readonly<{
	adapter: RemoteAdapter;
	hasRemoteBindings: boolean;
}>;

/** Bun.build options coordinated with eXact's asynchronously prepared artifact graph. */
export type ExactBunBuildOptions = Readonly<{
	entrypoints?: readonly string[];
	plugins?: readonly BunPluginLike[];
	exact?: ExactBunPluginOptions;
	root?: string;
	[key: string]: unknown;
}>;

/** Prepares remote artifacts before invoking Bun.build and publishes only a successful generation. */
export async function exactBuild(options: ExactBunBuildOptions): Promise<unknown> {
	const runtime = globalThis as typeof globalThis & {
		Bun?: { build(options: Record<string, unknown>): Promise<unknown> };
	};
	if (!runtime.Bun) throw new Error('exactBuild() requires the Bun runtime');
	const applicationRoot = path.resolve(
		options.exact?.applicationRoot ?? options.root ?? process.cwd()
	);
	const loadedConfig = await loadExactConfig({
		applicationRoot,
		configPath: options.exact?.configPath
	});
	const registry = await prepareExactPluginRegistry({
		applicationRoot,
		loadedConfig,
		hostMode: 'build'
	});
	const value = registry.build.get('@exactjs/microfrontends');
	let remote: ExactPreparedBunRemoteBuild | undefined;
	let remoteEntrypoints: readonly string[] = [];
	let banner = options.banner;
	if (value) {
		const [{ readExactMicrofrontendBuildConfig, prepareExactRemoteArtifactBuild }, integration] =
			await Promise.all([
				import('@exactjs/microfrontends/rollup'),
				import('@exactjs/microfrontends/bun')
			]);
		const buildConfig = readExactMicrofrontendBuildConfig(value as never);
		const prepared = await prepareExactRemoteArtifactBuild({
			applicationRoot,
			buildConfig,
			serverComponents: options.exact?.serverComponents,
			componentAuthorization: options.exact?.componentAuthorization
		});
		const { createExactExposureRegistrationModules } = await import('@exactjs/microfrontends');
		const registrationModules = prepared.artifactGraph
			? createExactExposureRegistrationModules(prepared.plan, prepared.artifactGraph, {
					applicationRoot
				})
			: {};
		const adapter = integration.createExactRemoteBunAdapter({
			plan: prepared.plan,
			applicationRoot,
			registrationModules,
			publicPath: publicPath(options),
			onEntries: options.exact?.onRemoteEntries,
			onDevelopmentEntries: options.exact?.onRemoteDevelopmentEntries
		});
		remote = Object.freeze({ adapter, hasRemoteBindings: prepared.hasRemoteBindings });
		remoteEntrypoints = adapter.entrypoints;
		if (prepared.hasRemoteBindings)
			banner = prependJavascriptBanner(
				banner,
				`import ${JSON.stringify(adapter.pageBootstrapImport)};`
			);
	}

	const { exact: _exactOptions, plugins = [], entrypoints = [], ...buildOptions } = options;
	const exactPlugin = exact({ ...options.exact, __exactRemoteBuild: remote });
	try {
		return await runtime.Bun.build({
			...buildOptions,
			...(banner === undefined ? {} : { banner }),
			entrypoints: [...entrypoints, ...remoteEntrypoints],
			plugins: [exactPlugin, ...plugins]
		});
	} finally {
		await exactPlugin.dispose();
	}
}

function publicPath(options: ExactBunBuildOptions): string | undefined {
	return typeof options.publicPath === 'string' ? options.publicPath : undefined;
}

function prependJavascriptBanner(current: unknown, prefix: string): unknown {
	if (typeof current === 'string') return `${prefix}\n${current}`;
	if (current && typeof current === 'object' && !Array.isArray(current)) {
		const record = current as Record<string, unknown>;
		return { ...record, js: `${prefix}\n${typeof record.js === 'string' ? record.js : ''}` };
	}
	return prefix;
}
