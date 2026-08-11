import { loadExactConfig } from '@exactjs/config/node';
import { prepareExactPluginRegistry, invalidateExactPluginRegistry } from '@exactjs/plugin-host/node';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Compiler, Compilation } from 'webpack';
import type { ExactWebpackPluginOptions } from './plugin.js';
import type { ExactProvidedPackageImportUsage } from '@exactjs/microfrontends/artifacts';

type RemoteAdapter = ReturnType<
	typeof import('@exactjs/microfrontends/webpack')['createExactRemoteWebpackAdapter']
>;

const virtualScheme = 'exact-remote:';

/** Owns one Webpack compiler's remote plan, virtual modules, and accepted generations. */
export class ExactWebpackMicrofrontendIntegration {
	private adapter?: RemoteAdapter;
	private virtualSources = new Map<string, string>();
	private scopes = new Map<string, string>();
	private internalIds: string[] = [];
	private watchFiles = new Set<string>();
	private generation?: number;
	private pendingOutputs?: Parameters<RemoteAdapter['acceptGeneration']>[1];
	private preparation?: Promise<void>;
	private remoteBindings = false;

	constructor(
		private readonly compiler: Compiler,
		private readonly options: ExactWebpackPluginOptions
	) {}

	/** Installs lifecycle hooks without loading the optional microfrontend package for ordinary builds. */
	install(): void {
		const hooks = this.compiler.hooks;
		hooks.beforeCompile.tapPromise('ExactWebpackMicrofrontends', async () => {
			await this.prepare();
			this.generation = this.adapter?.beginGeneration();
		});
		hooks.thisCompilation.tap('ExactWebpackMicrofrontends', (compilation, params) => {
			this.installVirtualModules(compilation);
			this.installRemoteResolution(params.normalModuleFactory as any);
			compilation.hooks.processAssets.tap(
				{ name: 'ExactWebpackMicrofrontends', stage: this.compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
				() => (this.pendingOutputs = this.indexOutputs(compilation))
			);
		});
		hooks.make.tapPromise('ExactWebpackMicrofrontends', async (compilation) => {
			await this.prepare();
			if (!this.adapter) return;
			for (const [name, id] of Object.entries(this.adapter.entries))
				await addEntry(this.compiler, compilation, name, this.virtualId(id));
			if (this.adapter.pageBootstrapImport && this.hasRemoteBindings()) {
				const bootstrap = this.virtualId('\0exact:provided/bootstrap');
				await addEntry(this.compiler, compilation, 'exact-provided-packages', bootstrap);
				for (const [name, entry] of compilation.entries)
					if (name !== 'exact-provided-packages')
						(entry.options.dependOn ??= []).push('exact-provided-packages');
			}
		});
		hooks.done.tap('ExactWebpackMicrofrontends', (stats) => {
			if (!this.adapter || this.generation === undefined) return;
			if (stats.hasErrors() || !this.pendingOutputs)
				this.adapter.rejectGeneration(this.generation);
			else this.adapter.acceptGeneration(this.generation, this.pendingOutputs);
			this.pendingOutputs = undefined;
		});
		hooks.failed.tap('ExactWebpackMicrofrontends', () => this.reject());
		hooks.invalid.tap('ExactWebpackMicrofrontends', () => this.invalidate());
		hooks.watchClose.tap('ExactWebpackMicrofrontends', () => this.dispose());
		hooks.shutdown.tap('ExactWebpackMicrofrontends', () => this.dispose());
	}

	invalidate(): void {
		this.reject();
		this.preparation = undefined;
		invalidateExactPluginRegistry(this.applicationRoot());
	}

	dispose(): void {
		this.reject();
		this.adapter?.dispose();
		this.adapter = undefined;
		this.virtualSources.clear();
		this.scopes.clear();
		this.watchFiles.clear();
	}

	private async prepare(): Promise<void> {
		return (this.preparation ??= this.prepareOnce());
	}

	private async prepareOnce(): Promise<void> {
		if (this.options.target === 'server') return;
		const applicationRoot = this.applicationRoot();
		const loadedConfig = await loadExactConfig({ applicationRoot, configPath: this.options.configPath });
		const registry = await prepareExactPluginRegistry({ applicationRoot, loadedConfig, hostMode: 'build' });
		const value = registry.build.get('@exactjs/microfrontends');
		if (!value) return;
		const [{ readExactMicrofrontendBuildConfig, prepareExactRemoteArtifactBuild }, integration, api] =
			await Promise.all([
				import('@exactjs/microfrontends/rollup'),
				import('@exactjs/microfrontends/webpack'),
				import('@exactjs/microfrontends')
			]);
		const prepared = await prepareExactRemoteArtifactBuild({
			applicationRoot,
			buildConfig: readExactMicrofrontendBuildConfig(value as never),
			serverComponents: this.options.serverComponents,
			componentAuthorization: this.options.componentAuthorization
		});
		const registrationModules = prepared.artifactGraph
			? api.createExactExposureRegistrationModules(prepared.plan, prepared.artifactGraph, { applicationRoot })
			: {};
		const nextAdapter = integration.createExactRemoteWebpackAdapter({
			plan: prepared.plan,
			applicationRoot,
			registrationModules,
			publicPath: webpackPublicPath(this.compiler),
			onEntries: this.options.onRemoteEntries,
			onDevelopmentEntries: this.options.onRemoteDevelopmentEntries
		});
		this.adapter?.dispose();
		this.adapter = nextAdapter;
		this.virtualSources.clear();
		this.scopes.clear();
		this.watchFiles = new Set([
			...loadedConfig.watchFiles,
			...prepared.plan.exposures.map((exposure) =>
				path.resolve(applicationRoot, exposure.component)
			),
			...(prepared.artifactGraph?.artifacts.map((artifact) => artifact.inputFile) ?? [])
		]);
		this.remoteBindings = prepared.hasRemoteBindings;
		this.internalIds = prepared.plan.exposures.flatMap((exposure) => [
			exposure.entryId,
			exposure.componentFacadeId,
			exposure.registrationId
		]);
		for (const exposure of prepared.plan.exposures) {
			for (const id of [exposure.entryId, exposure.componentFacadeId, exposure.registrationId]) {
				const virtual = this.virtualId(id);
				const source = this.adapter.loadVirtualModule(id);
				if (source !== undefined) this.virtualSources.set(virtual, this.rewriteVirtualImports(source));
				this.scopes.set(virtual, exposure.root);
			}
		}
		this.virtualSources.set(
			this.virtualId('\0exact:provided/bootstrap'),
			this.adapter.loadVirtualModule('\0exact:provided/bootstrap') ?? prepared.plan.providedBootstrapSource
		);
	}

	private installVirtualModules(compilation: Compilation): void {
		for (const filename of this.watchFiles) compilation.fileDependencies.add(filename);
		this.compiler.webpack.NormalModule.getCompilationHooks(compilation).readResourceForScheme
			.for('exact-remote')
			.tap('ExactWebpackMicrofrontends', (resource) => this.virtualSources.get(resource) ?? null);
	}

	private installRemoteResolution(factory: any): void {
		factory.hooks.beforeResolve.tap('ExactWebpackMicrofrontends', (data: any) => {
			if (!data) return;
			const scope = this.scopeFor(data.contextInfo?.issuer);
			if (!scope) return;
			if (this.adapter && isProvidedRequest(data.request, this.adapter)) {
				const source = this.sourceFor(data.contextInfo?.issuer);
				const usages = source
					? importUsages(source, data.request)
					: [{ kind: 'namespace' as const, exportNames: [] }];
				const bridgeSource = this.adapter.providedBridge(data.request, usages);
				const id = this.virtualId(`bridge:${scope}:${data.request}:${JSON.stringify(usages)}`);
				this.virtualSources.set(id, bridgeSource);
				this.scopes.set(id, scope);
				data.request = id;
			}
		});
		factory.hooks.afterResolve.tap('ExactWebpackMicrofrontends', (data: any) => {
			const scope = data ? this.scopeFor(data.contextInfo?.issuer) : undefined;
			const resource = data?.createData?.resource;
			if (scope && resource && !resource.startsWith(virtualScheme))
				data.createData.resource = addScope(resource, scope);
		});
	}

	private indexOutputs(compilation: Compilation): Parameters<RemoteAdapter['acceptGeneration']>[1] {
		const outputs: Array<{ name?: string; fileName: string; type: 'entry' | 'chunk' | 'css' | 'asset' }> = [];
		const remoteNames = new Set(Object.keys(this.adapter?.entries ?? {}));
		for (const [name, entrypoint] of compilation.entrypoints) {
			if (!remoteNames.has(name)) continue;
			const files = entrypoint.getFiles();
			for (const fileName of files)
				outputs.push({ name, fileName, type: /\.css$/i.test(fileName) ? 'css' : 'entry' });
		}
		for (const filename of Object.keys(compilation.assets)) {
			if (outputs.some((value) => value.fileName === filename)) continue;
			outputs.push({ fileName: filename, type: /\.[cm]?js$/i.test(filename) ? 'chunk' : /\.css$/i.test(filename) ? 'css' : 'asset' });
		}
		return outputs;
	}

	private virtualId(id: string): string {
		return `${virtualScheme}${Buffer.from(id).toString('base64url')}`;
	}

	private rewriteVirtualImports(source: string): string {
		let rewritten = source;
		for (const id of this.internalIds)
			rewritten = rewritten.replaceAll(JSON.stringify(id), JSON.stringify(this.virtualId(id)));
		return rewritten;
	}

	private scopeFor(issuer: string | undefined): string | undefined {
		if (!issuer) return undefined;
		return this.scopes.get(issuer) ?? new URLSearchParams(issuer.split('?')[1] ?? '').get('exact-remote-scope') ?? undefined;
	}

	private sourceFor(issuer: string | undefined): string | undefined {
		if (!issuer) return undefined;
		const virtual = this.virtualSources.get(issuer);
		if (virtual !== undefined) return virtual;
		try { return readFileSync(issuer.split('?', 1)[0]!, 'utf8'); } catch { return undefined; }
	}

	private hasRemoteBindings(): boolean {
		return this.remoteBindings;
	}

	private reject(): void {
		if (this.adapter && this.generation !== undefined) this.adapter.rejectGeneration(this.generation);
		this.generation = undefined;
		this.pendingOutputs = undefined;
	}

	private applicationRoot(): string {
		return path.resolve(this.options.applicationRoot ?? this.compiler.context ?? process.cwd());
	}
}

function addEntry(compiler: Compiler, compilation: Compilation, name: string, request: string): Promise<void> {
	return new Promise((resolve, reject) =>
		compilation.addEntry(
			compiler.context,
			compiler.webpack.EntryPlugin.createDependency(request, { name }),
			{ name },
			(error) => (error ? reject(error) : resolve())
		)
	);
}

function webpackPublicPath(compiler: Compiler): string | undefined {
	const value = compiler.options.output.publicPath;
	return typeof value === 'string' ? value : undefined;
}

function addScope(resource: string, scope: string): string {
	return `${resource}${resource.includes('?') ? '&' : '?'}exact-remote-scope=${encodeURIComponent(scope)}`;
}

function isProvidedRequest(request: string, adapter: RemoteAdapter): boolean {
	try { adapter.providedBridge(request, [{ kind: 'namespace', exportNames: [] }]); return true; } catch { return false; }
}

function importUsages(source: string, request: string): ExactProvidedPackageImportUsage[] {
	const escaped = request.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = source.match(new RegExp(`import\\s+([^;]+?)\\s+from\\s+["']${escaped}["']`));
	if (!match) return [{ kind: 'namespace', exportNames: [] }];
	const clause = match[1]!.trim();
	if (clause.startsWith('*')) {
		const local = clause.match(/^\*\s+as\s+(\w+)/)?.[1];
		const exportNames = local
			? [...source.matchAll(new RegExp(`\\b${local}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map((value) => value[1]!)
			: [];
		return [{ kind: 'namespace', exportNames: [...new Set(exportNames)] }];
	}
	const result: ExactProvidedPackageImportUsage[] = [];
	if (!clause.startsWith('{')) result.push({ kind: 'default' });
	const named = clause.match(/\{([^}]+)\}/)?.[1];
	for (const item of named?.split(',') ?? []) {
		const [imported, local] = item.trim().split(/\s+as\s+/);
		if (imported) result.push({ kind: 'named', imported, ...(local ? { local } : {}) });
	}
	return result.length ? result : [{ kind: 'namespace', exportNames: [] }];
}
