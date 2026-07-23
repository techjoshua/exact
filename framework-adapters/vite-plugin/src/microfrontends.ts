import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import type { ExactPreparedPluginRegistry } from '@exactjs/plugin-host/node';

type ExactRemoteRollupAdapterLike = {
	readonly pageBootstrapImport: string;
	readonly developmentEntries: Readonly<Record<string, string>>;
	buildStart(context: {
		emitFile(file: {
			type: 'chunk';
			id: string;
			name: string;
			preserveSignature: 'strict';
		}): string;
	}): void;
	recordModule(code: string, id: string): void;
	resolveId(
		source: string,
		importer?: string,
		resolve?: ExactViteResolver
	): string | ExactViteResolveResult | null | Promise<string | ExactViteResolveResult | null>;
	load(id: string): string | null;
	generateBundle(bundle: Readonly<Record<string, ExactRollupOutputLike>>): void;
};

type ExactRollupOutputLike = {
	type: 'chunk' | 'asset';
	fileName: string;
	facadeModuleId?: string | null;
	isEntry?: boolean;
};

type ExactMicrofrontendsRollupModule = {
	readExactMicrofrontendCompilerConfig(value: unknown): unknown;
	prepareExactRemoteArtifactBuild(options: {
		applicationRoot: string;
		compilerConfig: unknown;
		pluginRegistry: ExactPreparedCompilerRegistry;
		serverComponents?: boolean;
	}): Promise<{
		plan: { exposures: readonly unknown[] };
		artifactGraph?: unknown;
		hasRemoteBindings: boolean;
	}>;
	createExactRemoteRollupAdapter(options: {
		plan: unknown;
		applicationRoot: string;
		artifactGraph?: unknown;
		registrationModules?: Readonly<Record<string, string>>;
		onEntries?: (entries: Readonly<Record<string, string>>) => void;
	}): ExactRemoteRollupAdapterLike;
};

type ExactMicrofrontendsRollupLoader = () => Promise<ExactMicrofrontendsRollupModule>;

type ExactViteResolveResult = {
	id: string;
	external?: boolean | 'absolute' | 'relative';
};

type ExactViteResolver = (
	source: string,
	importer?: string
) => Promise<ExactViteResolveResult | null>;

/** Configuration projected from the Vite plugin into optional microfrontend integration. */
export type ExactViteMicrofrontendOptions = {
	target?: string;
	serverComponents?: boolean;
	onRemoteEntries?: (entries: Readonly<Record<string, string>>) => void;
	onRemoteDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
};

/**
 * Owns the optional microfrontend Rollup adapter lifecycle without coupling the
 * main Vite transform pipeline to remote artifact planning and HTML injection.
 */
export function createExactViteMicrofrontendIntegration(
	options: ExactViteMicrofrontendOptions,
	loadRollup: ExactMicrofrontendsRollupLoader = async () =>
		(await import('@exactjs/microfrontends/rollup')) as unknown as ExactMicrofrontendsRollupModule
) {
	let adapter: ExactRemoteRollupAdapterLike | undefined;
	let publishProvidedPackages = false;
	let serveMode = false;

	return {
		async buildStart(
			registry: ExactPreparedPluginRegistry,
			emitFile:
				| ((file: {
						type: 'chunk';
						id: string;
						name: string;
						preserveSignature: 'strict';
				  }) => string)
				| undefined,
			command: 'build' | 'serve' = 'build'
		): Promise<void> {
			if (options.target === 'server') return;
			serveMode = command === 'serve';
			const remotePlugin = registry.compiler.plugins['@exactjs/microfrontends'];
			if (!remotePlugin) return;
			const integration = await loadRollup();
			const compilerConfig = integration.readExactMicrofrontendCompilerConfig(
				remotePlugin.cacheKey
			);
			const prepared = await integration.prepareExactRemoteArtifactBuild({
				applicationRoot: registry.applicationRoot,
				compilerConfig,
				pluginRegistry: registry.compiler,
				serverComponents: options.serverComponents
			});
			adapter = integration.createExactRemoteRollupAdapter({
				plan: prepared.plan,
				applicationRoot: registry.applicationRoot,
				...(prepared.artifactGraph
					? { artifactGraph: prepared.artifactGraph }
					: { registrationModules: {} }),
				onEntries: options.onRemoteEntries
			});
			options.onRemoteDevelopmentEntries?.(adapter.developmentEntries);
			publishProvidedPackages = prepared.hasRemoteBindings;
			if (command === 'build') {
				if (!emitFile) throw new Error('Vite/Rollup emitFile is unavailable for remote entries');
				adapter.buildStart({ emitFile });
			}
		},
		resolveId(
			source: string,
			importer: string | undefined,
			resolveFrameworkImport: () => string | null,
			resolve?: ExactViteResolver
		): string | ExactViteResolveResult | null | Promise<string | ExactViteResolveResult | null> {
			if (!adapter) return resolveFrameworkImport();
			return Promise.resolve(adapter.resolveId(source, importer, resolve)).then(
				(remote) => remote ?? resolveFrameworkImport()
			);
		},
		load(id: string): string | null {
			return adapter?.load(id) ?? null;
		},
		recordModule(code: string, id: string): void {
			adapter?.recordModule(code, id);
		},
		transformIndexHtml(html: string): string {
			if (!publishProvidedPackages || !adapter) return html;
			const moduleId = serveMode
				? `/@id/${adapter.pageBootstrapImport}`
				: adapter.pageBootstrapImport;
			return injectProvidedPackageBootstrap(html, moduleId);
		},
		generateBundle(bundle: Readonly<Record<string, ExactRollupOutputLike>>): void {
			adapter?.generateBundle(bundle);
		}
	};
}

function injectProvidedPackageBootstrap(html: string, moduleId: string): string {
	const bootstrap = `<script type="module" src=${JSON.stringify(moduleId)}></script>`;
	const firstModule = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>/i;
	if (firstModule.test(html)) return html.replace(firstModule, `${bootstrap}$&`);
	const body = /<\/body\s*>/i;
	if (body.test(html)) return html.replace(body, `${bootstrap}$&`);
	return `${html}${bootstrap}`;
}
