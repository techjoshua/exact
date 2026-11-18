import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';
import type { TransformOptions } from '../types.js';
import type { NativeExecutableSelection } from '../native/process-executable-selection.js';

import { preparePackageEnhancementSource } from './package-enhancements.js';
import { synchronizeNativeProject } from './project-synchronization.js';

/** Build-owned acquisition options. The host resolves executable identities without evaluating modules. */
export type ExactHostExecutableSelection<Prepared = undefined> = Readonly<
	Pick<TransformOptions, 'root' | 'configFile' | 'packageEnhancements'> & {
		filename: string;
		/** Authored local entry roots are prepared before their siblings can load. */
		sourceRoot?: string;
		/** Exact host-owned executable files, including nominated runtime package artifacts and their dependencies. */
		additionalSourceFiles?: readonly string[];
		source: string;
		target: 'client' | 'server';
		/** Ordinary pass-through sources share serialization without acquiring private source authority. */
		selectSource?: boolean;
		/** Final adapter preparation. Raw discovery never supplies private authority. */
		prepare?(
			source: string,
			filename: string,
			target: 'client' | 'server'
		): Readonly<{ source: string; prepared: Prepared; privateSource?: boolean }>;
		resolve(
			specifier: string,
			importer: string,
			kind: 'import' | 'require'
		): Promise<Readonly<{ id: string; external?: boolean }> | undefined>;
	}
>;

/**
 * Installs one complete local host graph and runs its dependent compiler work before
 * another operation can replace it. Bare imports can select only explicitly named files.
 * External, virtual, unresolved and unnamed package edges stay opaque.
 * The adapter retains resolver, session, and build lifecycle ownership.
 */
export function withExactHostExecutableSelection<Result, Prepared = undefined>(
	session: ExactCompilerSession,
	acquire: () => ExactHostExecutableSelection<Prepared>,
	run: (
		target: ExactHostExecutableSelection['target'],
		prepared?: Prepared
	) => Result | Promise<Result>
): Promise<Result> {
	return withExecutableSelection(session, async (nextGeneration) => {
		const options = acquire();
		const sourceRoot = options.sourceRoot ?? options.root ?? path.dirname(options.filename);
		const additionalSourceFiles = new Set(
			(options.additionalSourceFiles ?? [])
				.filter(path.isAbsolute)
				.map((file) => path.resolve(file))
		);
		const authoredRoot = localSource(options.filename, sourceRoot, additionalSourceFiles);
		if (options.selectSource === false && !authoredRoot) return await run(options.target);
		const collect = async (prepare: boolean) => {
			const rawSources = new Map<string, string>([
				[path.resolve(options.filename), options.source]
			]);
			const sources = new Map<string, string>();
			const opaque = new Set<string>();
			let rootPrepared: Prepared | undefined;
			const edges: NativeExecutableSelection['edges'][number][] = [];
			const modules: NativeExecutableSelection['modules'][number][] = [];
			for (const [filename, raw] of rawSources) {
				const result = prepare ? options.prepare?.(raw, filename, options.target) : undefined;
				const source = result?.source ?? raw;
				if (result?.privateSource === false) opaque.add(filename);
				sources.set(filename, source);
				if (filename === path.resolve(options.filename)) rootPrepared = result?.prepared;
				const prepared = preparePackageEnhancementSource(
					source,
					filename,
					options.packageEnhancements,
					options.root
				);
				const native = session.compileNative({
					kind: 'executable-slots',
					id: filename,
					source: prepared.source,
					root: options.root,
					configFile: options.configFile,
					target: 'default',
					diagnostics: 'syntax',
					...(prepared.moduleSpecifiers.size
						? { packageEnhancementBoundary: prepared.authoredLength }
						: {})
				});
				if (!native.executableSlots)
					throw new Error('Native compiler did not supply executable syntax slots');
				modules.push({ id: filename, sourceId: filename, contentRevision: hash(prepared.source) });
				for (const slot of native.executableSlots) {
					const edge: {
						importer: string;
						slot: number;
						specifier: string;
						kind: 'import' | 'require';
						selected?: string;
					} = {
						importer: filename,
						slot: slot.slot,
						specifier: slot.specifier,
						kind: slot.kind
					};
					const relative = slot.specifier.startsWith('.') || path.isAbsolute(slot.specifier);
					if (!slot.typeOnly && (relative || additionalSourceFiles.size !== 0)) {
						let selected: Awaited<ReturnType<ExactHostExecutableSelection['resolve']>>;
						try {
							selected = await options.resolve(slot.specifier, filename, slot.kind);
						} catch {
							/* The normal host retains its resolution error. No typed body gains authority. */
						}
						if (
							selected &&
							!selected.external &&
							(relative || additionalSourceFiles.has(path.resolve(selected.id))) &&
							localSource(selected.id, sourceRoot, additionalSourceFiles)
						) {
							const selectedFile = path.resolve(selected.id);
							try {
								const content =
									rawSources.get(selectedFile) ?? (await readFile(selectedFile, 'utf8'));
								rawSources.set(selectedFile, content);
								edge.selected = selectedFile;
							} catch {
								/* A host-only module cannot authorize private source lowering. */
							}
						}
					}
					edges.push(edge);
				}
			}
			const authorizedEdges = edges.map((edge) => {
				if (!edge.selected || !opaque.has(edge.selected)) return edge;
				const { selected: _selected, ...opaqueEdge } = edge;
				return opaqueEdge;
			});
			return {
				sources,
				modules,
				edges: authorizedEdges,
				rootPrepared,
				opaque
			};
		};
		const install = async (
			{ sources, modules, edges }: Awaited<ReturnType<typeof collect>>,
			target: NativeExecutableSelection['target']
		) => {
			const revision = hash(JSON.stringify({ target, modules, edges }));
			await synchronizeNativeProject(
				[...sources.keys()],
				{
					root: options.root,
					configFile: options.configFile,
					session,
					packageEnhancements: options.packageEnhancements,
					executableSelection: {
						generation: nextGeneration(),
						revision,
						target,
						modules,
						edges
					}
				},
				sources
			);
		};
		const raw = await collect(false);
		// Discovery is fenced from client/server lowering even if final preparation throws.
		const discoveryTarget = options.prepare ? 'default' : options.target;
		await install(raw, discoveryTarget);
		const final = options.prepare ? await collect(true) : raw;
		if (options.prepare) await install(final, options.target);
		return await run(options.target, final.rootPrepared);
	});
}

function localSource(
	id: string,
	sourceRoot: string,
	additionalSourceFiles: ReadonlySet<string>
): boolean {
	const relative = path.relative(sourceRoot, id);
	if (
		(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) &&
		!additionalSourceFiles.has(path.resolve(id))
	)
		return false;
	return (
		path.isAbsolute(id) &&
		/\.[cm]?[jt]sx?$/i.test(id) &&
		!/\.d\.[cm]?ts$/i.test(id) &&
		(!/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id) || additionalSourceFiles.has(path.resolve(id)))
	);
}

function hash(source: string): string {
	return createHash('sha256').update(source).digest('hex');
}

/** Serializes one session's executable selection without retaining callable rewrite authority. */
const owners = new WeakMap<ExactCompilerSession, { pending: Promise<void>; generation: number }>();

function sessionOwner(session: ExactCompilerSession) {
	let owner = owners.get(session);
	if (!owner) owners.set(session, (owner = { pending: Promise.resolve(), generation: 0 }));
	return owner;
}

/** Serializes snapshot acquisition, installation, and its dependent compiler work. */
async function withExecutableSelection<Result>(
	session: ExactCompilerSession,
	run: (nextGeneration: () => number) => Result | Promise<Result>
): Promise<Result> {
	const owner = sessionOwner(session);
	const previous = owner.pending;
	let release!: () => void;
	owner.pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await run(() => ++owner.generation);
	} finally {
		release();
	}
}
