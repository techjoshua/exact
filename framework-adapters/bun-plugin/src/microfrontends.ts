import type { ExactBunResolver } from './component-authorization.js';
import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ExactPreparedBunRemoteBuild } from './build.js';
import type { BunBuildLike } from './plugin.js';

type RemoteAdapter = ExactPreparedBunRemoteBuild['adapter'];

/** Owns Bun resolver scope and accepted-generation state for one remote build. */
export class ExactBunMicrofrontendIntegration {
	readonly #remote: RemoteAdapter;
	readonly #paths = new Map<string, string>();
	readonly #sources = new Map<string, string>();
	#generation: number | undefined;

	constructor(remote: RemoteAdapter) {
		this.#remote = remote;
	}

	/** Installs remote resolution, loading, and provided-package bridge hooks on one Bun build. */
	install(build: BunBuildLike, resolveProvider?: ExactBunResolver): void {
		build.onResolve({ filter: /exact-remote-scope=/ }, (args) => {
			const scope = remoteScope(args.path);
			const filename = args.path.split('?', 1)[0]!;
			if (scope) this.#paths.set(normalizeRemotePath(filename), scope);
			return { path: filename };
		});
		build.onResolve({ filter: /^(?:virtual:exact-provided-packages|exact-remote-)/ }, (args) =>
			this.#remote.onResolve(args.path)
		);
		build.onLoad({ filter: /.*/, namespace: this.#remote.namespace }, (args) =>
			this.#remote.onLoad(args.path)
		);
		build.onResolve({ filter: /^\.{1,2}[\\/]/ }, (args) => {
			const scope = this.scope(args.importer);
			if (!scope) return undefined;
			const importer = normalizeRemotePath(args.importer ?? '');
			const resolved = resolveRemoteImport(args.path, importer);
			if (!resolved) return undefined;
			this.#paths.set(normalizeRemotePath(resolved), scope);
			return { path: resolved };
		});
		build.onResolve({ filter: /^(?:@[^/]+\/[^/]+|[^./][^:]*)/ }, async (args) => {
			const importer = args.importer ?? '';
			const scope = this.scope(importer);
			if (!this.#remote.ownsRemoteModule(importer) && !scope) return undefined;
			if (this.#remote.isProvidedRequest(args.path)) {
				const source = this.importerSource(importer);
				const usages = this.#remote.analyzeProvidedImports(source, importer).get(args.path);
				if (!usages)
					throw new Error(`Provided-package import was not analyzed: ${args.path} in ${importer}`);
				return this.#remote.registerProvidedBridge(args.path, usages);
			}
			if (!scope) return undefined;
			if (!resolveProvider) return undefined;
			const resolved = (
				await resolveProvider(args.path, {
					kind: 'import-statement',
					resolveDir: path.dirname(normalizeRemotePath(importer))
				})
			).path;
			if (!path.isAbsolute(resolved)) return undefined;
			this.#paths.set(normalizeRemotePath(resolved), scope);
			return { path: resolved };
		});
	}

	/** Begins a candidate remote artifact generation for the next build. */
	begin(): void {
		this.#generation = this.#remote.beginGeneration();
	}

	/** Accepts successful output metadata or rejects the current failed generation. */
	finish(build: BunBuildLike, result: BunBuildResult | undefined): void {
		if (this.#generation === undefined) return;
		if (result?.success === false) {
			this.#remote.rejectGeneration(this.#generation);
			return;
		}
		this.#remote.acceptGeneration(this.#generation, bunRemoteOutputs(result, build.config?.outdir));
	}

	/** Releases candidate-generation and generated-module state owned by this integration. */
	dispose(): void {
		if (this.#generation !== undefined) this.#remote.rejectGeneration(this.#generation);
		this.#generation = undefined;
		this.#paths.clear();
		this.#sources.clear();
		this.#remote.dispose();
	}

	/** Reports whether a source file belongs to the remote build scope. */
	includes(filename: string): boolean {
		return this.scope(filename) !== undefined;
	}

	/** Retains scoped source text long enough to derive its provided-package import usage. */
	recordSource(filename: string, source: string): void {
		if (this.includes(filename)) this.#sources.set(normalizeRemotePath(filename), source);
	}

	private scope(filename: string | undefined): string | undefined {
		return (
			remoteScope(filename) ??
			(filename ? this.#paths.get(normalizeRemotePath(filename)) : undefined)
		);
	}

	/**
	 * Returns the most recent importer source, falling back to the file Bun is resolving.
	 *
	 * Bun may resolve a dependency before the catch-all load hook records its importer. Generated
	 * remote modules remain owned by the adapter; ordinary scoped modules can be read from disk so
	 * their provided-package facade never depends on hook ordering.
	 */
	private importerSource(filename: string): string | undefined {
		const normalized = normalizeRemotePath(filename);
		return (
			this.#remote.onLoad(filename)?.contents ??
			this.#sources.get(normalized) ??
			readBunImporterSource(normalized)
		);
	}
}

type BunBuildResult = Parameters<NonNullable<BunBuildLike['onEnd']>>[0] extends (
	value: infer Value
) => unknown
	? Value
	: never;

function bunRemoteOutputs(
	result: BunBuildResult | undefined,
	outputRoot?: string
): readonly Readonly<{
	entrypoint?: string;
	path: string;
	kind: 'entry' | 'chunk' | 'css' | 'asset';
}>[] {
	// Bun's metafile keys are relative to outdir, including a leading './'. Resolve once
	// so hashed entry filenames retain their actual source identity without suffix guesses.
	const metadataByPath = new Map(
		Object.entries(result?.metafile?.outputs ?? {}).map(([filename, metadata]) => [
			path.resolve(outputRoot ?? '.', filename),
			metadata
		])
	);
	return (result?.outputs ?? []).map((output) => {
		const metadata = metadataByPath.get(path.resolve(output.path));
		const extension = path.extname(output.path).toLowerCase();
		const isEntry =
			/\.[cm]?js$/.test(extension) &&
			(metadata?.entryPoint !== undefined || output.kind === 'entry-point');
		const kind = isEntry
			? 'entry'
			: extension === '.css'
				? 'css'
				: /\.[cm]?js$/.test(extension)
					? 'chunk'
					: 'asset';
		const entrypoint =
			metadata?.entryPoint ?? (isEntry ? path.basename(output.path, extension) : undefined);
		return {
			path: relativeBunOutput(output.path, outputRoot),
			kind,
			...(entrypoint ? { entrypoint } : {})
		};
	});
}

function relativeBunOutput(filename: string, outputRoot: string | undefined): string {
	if (!outputRoot) return path.basename(filename);
	const relative = path.relative(path.resolve(outputRoot), path.resolve(filename));
	return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
		? path.basename(filename)
		: relative.replaceAll('\\', '/');
}

function remoteScope(id: string | undefined): string | undefined {
	if (!id) return undefined;
	return new URLSearchParams(id.split('?')[1] ?? '').get('exact-remote-scope') ?? undefined;
}

function normalizeRemotePath(value: string): string {
	return value.replaceAll('\\', '/').split('?', 1)[0]!;
}

/** Reads a filesystem-backed Bun importer without treating virtual module identifiers as paths. */
export function readBunImporterSource(filename: string): string | undefined {
	if (!path.isAbsolute(filename)) return undefined;
	try {
		return readFileSync(filename, 'utf8');
	} catch {
		return undefined;
	}
}

function resolveRemoteImport(request: string, importer: string): string | undefined {
	if (!importer) return undefined;

	const base = path.resolve(path.dirname(importer), request);
	for (const candidate of remoteCandidates(base)) {
		try {
			if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
		} catch {
			// The candidate disappeared during a watch rebuild; let Bun report normal resolution.
		}
	}
	return undefined;
}

function remoteCandidates(base: string): string[] {
	if (path.extname(base)) return [base];
	const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs', '.cts', '.cjs', '.json'];
	return [
		base,
		...extensions.map((extension) => `${base}${extension}`),
		...extensions.map((extension) => path.join(base, `index${extension}`))
	];
}
