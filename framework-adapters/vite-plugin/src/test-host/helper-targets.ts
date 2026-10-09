import {
	exactGeneratedArtifactTarget,
	exactTestHelperTarget,
	shouldCompileExactBuildModule,
	shouldTransformExactBuildModulePath
} from '@exactjs/compiler/adapter-support';
import { exactExportConditions, type TransformOptions } from '@exactjs/compiler';
import type { ResolvedConfig } from 'vite';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ExactPluginOptions } from '../plugin-contracts.js';
import {
	exactModuleFilename,
	exactTestModuleTarget,
	exactTransformTarget,
	exactViteRequestTarget
} from '../module-selection.js';

/** Owns test helper projection choices until their imports resolve or the plugin is disposed. */
export class ExactViteTestHelperTargets {
	readonly #targets = new Map<string, 'client' | 'server'>();
	readonly #requests = new Map<string, 'client' | 'server'>();
	#serverResolver?: ReturnType<ResolvedConfig['createResolver']>;
	constructor(private readonly options: ExactPluginOptions) {}

	/** Keeps server export conditions local to the server lane of a paired test graph. */
	configure(config: { createResolver?: ResolvedConfig['createResolver'] }): void {
		if (this.options.serverExecutionReason !== 'server-test' || !config.createResolver) return;
		this.#serverResolver = config.createResolver({
			conditions: [
				...exactExportConditions('server', this.options),
				'module',
				'node',
				'development|production'
			],
			mainFields: ['module', 'jsnext:main', 'jsnext']
		});
	}

	/** Applies server conditions to package imports while retaining the host's aliases and virtual resolutions. */
	async resolve(
		source: string,
		importer: string | undefined,
		target: 'client' | 'server',
		host: (
			source: string,
			importer?: string
		) => Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>
	): Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null> {
		const resolved = await host(source, importer);
		if (!resolved || target !== 'server' || !this.#serverResolver) return resolved;
		if (source.startsWith('.') || source.startsWith('\0') || path.isAbsolute(source)) {
			return { ...resolved, id: await this.#ownedId(resolved.id, target, source) };
		}
		const id = await this.#serverResolver(source, importer, false, true);
		return id
			? { ...resolved, id: await this.#ownedId(id, target, source), external: false }
			: resolved;
	}

	/** Separates component projections and their bundle catalogs while sharing ordinary runtime authority. */
	async #ownedId(id: string, target: 'client' | 'server', source: string): Promise<string> {
		const projected =
			this.options.compileTestModules &&
			!exactGeneratedArtifactTarget(id) &&
			!exactTestModuleTarget(id, this.options) &&
			(source === '@exactjs/core/framework/enhancement-catalog' ||
				/[\\/]core[\\/](?:src|dist)(?:[\\/](?:client|server))?[\\/]framework[\\/]enhancement-catalog\.[cm]?[jt]s$/u.test(
					id
				) ||
				(await this.#authoredProjection(id)));
		const queried = projected ? `${id}${id.includes('?') ? '&' : '?'}exact-target=${target}` : id;
		this.retain(queried, target);
		return queried;
	}

	/** Reads only eligible authored files so nonvisual context and task modules retain one identity. */
	async #authoredProjection(id: string): Promise<boolean> {
		if (!shouldTransformExactBuildModulePath(id, this.options)) return false;
		if (this.options.include) return true;
		if (
			!/\.[cm]?[jt]sx?(?:$|\?)/u.test(id) ||
			/(?:^|[\\/])(?:node_modules|dist)(?:[\\/]|$)/u.test(id)
		)
			return false;
		try {
			return shouldCompileExactBuildModule(
				id,
				await readFile(exactModuleFilename(id), 'utf8'),
				this.options
			);
		} catch (error) {
			if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
			throw error;
		}
	}

	/** Retains projection ownership for generated facades and their relative dependency closure. */
	retain(id: string, target: 'client' | 'server'): void {
		if (this.options.serverExecutionReason === 'server-test') this.#requests.set(id, target);
	}

	/** Uses a transformed helper's projection for its imports, otherwise the host's request target. */
	request(importer: string | undefined, ssr?: boolean, source?: string): 'client' | 'server' {
		// Server APIs keep their renderer catalog and task authority even when imported
		// by the client lane's test module. Browser conditions do not own them.
		if (
			this.options.serverExecutionReason === 'server-test' &&
			/^@exactjs\/(?:ssr|server)(?:\/|$)/u.test(source ?? '')
		)
			return 'server';
		return (
			(importer &&
				(exactGeneratedArtifactTarget(importer) ||
					exactTestModuleTarget(importer, this.options) ||
					this.#targets.get(importer) ||
					this.#requests.get(importer))) ||
			(this.options.serverExecutionReason === 'server-test'
				? exactTransformTarget(this.options)
				: exactViteRequestTarget(this.options, ssr))
		);
	}

	/** Replaces stale choices before compiling a changed helper. Explicit test targets take precedence. */
	transform(
		source: string,
		id: string,
		ssr: boolean | undefined,
		analysisOptions: TransformOptions
	): 'client' | 'server' {
		const inheritedTarget = this.#requests.get(id);
		this.#targets.delete(id);
		const artifactTarget = exactGeneratedArtifactTarget(id);
		if (artifactTarget) return artifactTarget;
		// Vitest's SSR transport runs browser tests too. It does not choose the
		// component artifact target. Explicit server helpers are planned below.
		let target =
			inheritedTarget ??
			(this.options.serverExecutionReason === 'server-test'
				? exactTransformTarget(this.options)
				: exactViteRequestTarget(this.options, ssr));
		if (
			this.options.serverExecutionReason === 'server-test' &&
			!exactTestModuleTarget(id, this.options) &&
			shouldCompileExactBuildModule(id, source, this.options)
		) {
			target = exactTestHelperTarget(
				source,
				{
					...analysisOptions,
					filename: exactModuleFilename(id),
					configFile: this.options.typescriptConfig
						? path.resolve(analysisOptions.root ?? process.cwd(), this.options.typescriptConfig)
						: undefined
				},
				target
			);
		}
		if (this.options.serverExecutionReason === 'server-test') this.#targets.set(id, target);
		return target;
	}

	/** Releases retained choices when the plugin's build processes close. */
	clear(): void {
		this.#targets.clear();
		this.#requests.clear();
	}
}
