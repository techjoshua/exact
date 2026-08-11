import path from 'node:path';
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

	install(build: BunBuildLike): void {
		build.onResolve({ filter: /exact-remote-scope=/ }, (args) => {
			const scope = remoteScope(args.path);
			const filename = args.path.split('?', 1)[0]!;
			if (scope) this.#paths.set(normalizeRemotePath(filename), scope);
			return { path: filename };
		});
		build.onResolve({ filter: /^(?:virtual:exact-provided-packages|exact-remote:)/ }, (args) =>
			this.#remote.onResolve(args.path)
		);
		build.onLoad({ filter: /.*/, namespace: this.#remote.namespace }, (args) =>
			this.#remote.onLoad(args.path)
		);
		build.onResolve({ filter: /^(?:@[^/]+\/[^/]+|[^./][^:]*)/ }, (args) => {
			const importer = args.importer ?? '';
			if (!this.#remote.ownsRemoteModule(importer) && !this.includes(importer)) return undefined;
			try {
				const source =
					this.#remote.onLoad(importer)?.contents ??
					this.#sources.get(normalizeRemotePath(importer));
				return this.#remote.registerProvidedBridge(
					args.path,
					bunImportUsages(source, args.path)
				);
			} catch {
				return undefined;
			}
		});
	}

	begin(): void {
		this.#generation = this.#remote.beginGeneration();
	}

	finish(build: BunBuildLike, result: BunBuildResult | undefined): void {
		if (this.#generation === undefined) return;
		if (result?.success === false) {
			this.#remote.rejectGeneration(this.#generation);
			return;
		}
		this.#remote.acceptGeneration(
			this.#generation,
			bunRemoteOutputs(result, build.config?.outdir)
		);
	}

	includes(filename: string): boolean {
		return Boolean(remoteScope(filename) ?? this.#paths.get(normalizeRemotePath(filename)));
	}

	recordSource(filename: string, source: string): void {
		if (this.includes(filename)) this.#sources.set(normalizeRemotePath(filename), source);
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
	return (result?.outputs ?? []).map((output) => {
		const metadata = bunOutputMetadata(result?.metafile?.outputs, output.path);
		const extension = path.extname(output.path).toLowerCase();
		const isEntry = metadata?.entryPoint !== undefined || output.kind === 'entry-point';
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

function bunOutputMetadata(
	outputs: Readonly<Record<string, { entryPoint?: string }>> | undefined,
	filename: string
): { entryPoint?: string } | undefined {
	if (!outputs) return undefined;
	const normalized = filename.replaceAll('\\', '/');
	return (
		outputs[filename] ??
		outputs[normalized] ??
		Object.entries(outputs).find(([key]) => normalized.endsWith(key.replaceAll('\\', '/')))?.[1]
	);
}

function relativeBunOutput(filename: string, outputRoot: string | undefined): string {
	if (!outputRoot) return path.basename(filename);
	const relative = path.relative(path.resolve(outputRoot), path.resolve(filename));
	return relative.startsWith('..') || path.isAbsolute(relative)
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

function bunImportUsages(
	source: string | undefined,
	request: string
): import('@exactjs/microfrontends/artifacts').ExactProvidedPackageImportUsage[] {
	if (!source) return [{ kind: 'namespace', exportNames: [] }];
	const escaped = request.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = source.match(new RegExp(`import\\s+([^;]+?)\\s+from\\s+["']${escaped}["']`));
	if (!match) return [{ kind: 'side-effect' }];
	const clause = match[1]!.trim();
	if (clause.startsWith('*')) {
		const local = clause.match(/^\*\s+as\s+(\w+)/)?.[1];
		const exports = local
			? [...source.matchAll(new RegExp(`\\b${local}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
					(value) => value[1]!
				)
			: [];
		return [{ kind: 'namespace', exportNames: [...new Set(exports)] }];
	}
	const usages: import('@exactjs/microfrontends/artifacts').ExactProvidedPackageImportUsage[] = [];
	const named = clause.match(/\{([^}]+)\}/)?.[1];
	if (named)
		for (const name of named.split(','))
			usages.push({ kind: 'named', imported: name.trim().split(/\s+as\s+/)[0]! });
	if (!clause.startsWith('{')) usages.push({ kind: 'default' });
	return usages;
}
