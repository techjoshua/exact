import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
	generateProvidedPackageBridge,
	planProvidedPackageBridge,
	type ExactProvidedPackageImportUsage
} from './artifacts.js';
import type { ExactRemoteArtifactPlan, ExactRemoteExposureArtifact } from './build.js';
import { createExactExposureRegistrationModules } from './exposures.js';
import { analyzeProvidedPackageImports } from './import-analysis.js';
import type { ExactArtifactGraph } from '@exactjs/compiler';

/** Configures remote artifact emission for one application-scoped Rollup build. */
export type ExactRemoteRollupAdapterOptions = {
	plan: ExactRemoteArtifactPlan;
	applicationRoot: string;
	onEntries?: (entries: Readonly<Record<string, string>>) => void;
} & (
	| { registrationModules: Readonly<Record<string, string>>; artifactGraph?: never }
	| { artifactGraph: ExactArtifactGraph; registrationModules?: never }
);

/** Bridges the bundler-neutral remote artifact plan into Rollup lifecycle hooks. */
export type ExactRemoteRollupAdapter = {
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
		resolve?: ExactRollupResolver
	): ExactRollupResolveResult | Promise<ExactRollupResolveResult>;
	load(id: string): string | null;
	generateBundle(bundle: Readonly<Record<string, ExactRollupOutput>>): void;
};

/** Describes the Rollup output metadata needed to locate emitted remote entry chunks. */
export type ExactRollupOutput = {
	type: 'chunk' | 'asset';
	fileName: string;
	facadeModuleId?: string | null;
	isEntry?: boolean;
};

/** Represents the subset of Rollup module-resolution results used by the adapter. */
export type ExactRollupResolveResult =
	| string
	| { id: string; external?: boolean | 'absolute' | 'relative' }
	| null;

/** Resolves imports through the owning Rollup host without recursively invoking this adapter. */
export type ExactRollupResolver = (
	source: string,
	importer?: string
) => Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>;

const bridgePrefix = '\0exact:provided/';
const pageBootstrapImport = 'virtual:exact-provided-packages';
const pageBootstrapId = '\0exact:provided/bootstrap';
const remoteScopeParameter = 'exact-remote-scope';
const remoteLanguageParameter = 'exact-remote-lang';
const developmentEntryPrefix = 'virtual:exact-remote-entry/';

/** Maps the common remote artifact plan onto Rollup/Vite native plugin hooks. */
export function createExactRemoteRollupAdapter(
	options: ExactRemoteRollupAdapterOptions
): ExactRemoteRollupAdapter {
	const registrationModules =
		options.registrationModules ??
		createExactExposureRegistrationModules(options.plan, options.artifactGraph, {
			applicationRoot: options.applicationRoot
		});
	const exposuresById = new Map<
		string,
		{
			exposure: ExactRemoteExposureArtifact;
			kind: 'entry' | 'component' | 'registration';
		}
	>(
		options.plan.exposures.flatMap((exposure) => [
			[exposure.entryId, { exposure, kind: 'entry' as const }],
			[exposure.componentFacadeId, { exposure, kind: 'component' as const }],
			[exposure.registrationId, { exposure, kind: 'registration' as const }]
		])
	);
	const provided = new Set(options.plan.providedPackages);
	const developmentIds = new Map(
		options.plan.exposures.map((exposure) => [
			`${developmentEntryPrefix}${Buffer.from(exposure.exposure).toString('base64url')}`,
			exposure.entryId
		])
	);
	const importsByModule = new Map<
		string,
		ReadonlyMap<string, readonly ExactProvidedPackageImportUsage[]>
	>();
	return {
		pageBootstrapImport,
		developmentEntries: Object.freeze(
			Object.fromEntries(
				options.plan.exposures.map((exposure) => {
					const id = `${developmentEntryPrefix}${Buffer.from(exposure.exposure).toString('base64url')}`;
					return [exposure.exposure, `/@id/${id}`];
				})
			)
		),
		buildStart(context) {
			for (const exposure of options.plan.exposures)
				context.emitFile({
					type: 'chunk',
					id: exposure.entryId,
					name: entryName(exposure.exposure),
					preserveSignature: 'strict'
				});
		},
		recordModule(code, id) {
			if (!remoteScope(id, exposuresById)) return;
			importsByModule.set(
				id,
				analyzeProvidedPackageImports(code, id, options.plan.providedPackages)
			);
		},
		async resolveId(source, importer, resolve) {
			if (developmentIds.has(source)) return developmentIds.get(source)!;
			if (source === pageBootstrapImport || source === pageBootstrapId) return pageBootstrapId;
			if (exposuresById.has(source) || source.startsWith(bridgePrefix)) return source;
			if (importer === pageBootstrapId) return null;
			const remoteImporter = importer ? remoteScope(importer, exposuresById) : undefined;
			const requestedScope = remoteScope(source, new Map());
			if (provided.has(source) && remoteImporter) {
				let usages = importsByModule.get(importer!)?.get(source);
				if (!usages) {
					// Rolldown may request imports from an already-compiled physical module before
					// running transform hooks. Analyze that exact scoped importer on demand; virtual
					// modules remain fail-closed because their source is owned by load()/recordModule().
					const filename = unscopedId(importer!).split('?', 1)[0]!;
					if (path.isAbsolute(filename)) {
						let code: string | undefined;
						try {
							code = await readFile(filename, 'utf8');
						} catch {
							// The existing fail-closed diagnostic below owns missing or virtual sources.
						}
						if (code !== undefined) {
							const analysis = analyzeProvidedPackageImports(
								code,
								importer!,
								options.plan.providedPackages
							);
							importsByModule.set(importer!, analysis);
							usages = analysis.get(source);
						}
					}
				}
				if (!usages)
					throw new Error(
						`Provided package ${JSON.stringify(source)} was resolved before its import shape was analyzed in ${importer}`
					);
				return bridgeId(source, usages);
			}
			const scope = requestedScope ?? remoteImporter;
			if (!scope || !resolve) return null;
			const resolved = await resolve(
				unscopedId(source),
				importer ? unscopedId(importer) : undefined
			);
			if (!resolved || resolved.external) return resolved;
			if (resolved.id.startsWith('\0')) return resolved;
			return { ...resolved, id: scopedId(resolved.id, scope) };
		},
		load(id) {
			if (id === pageBootstrapId) return options.plan.providedBootstrapSource;
			const generated = exposuresById.get(id);
			if (generated?.kind === 'entry') return generated.exposure.entrySource;
			if (generated?.kind === 'component')
				return `export { default } from ${JSON.stringify(componentId(options.applicationRoot, generated.exposure))};\n`;
			if (generated?.kind === 'registration') {
				const source = registrationModules[generated.exposure.exposure];
				if (!source)
					throw new Error(
						`Missing hydration registration for remote exposure ${JSON.stringify(generated.exposure.exposure)}`
					);
				importsByModule.set(
					id,
					analyzeProvidedPackageImports(source, id, options.plan.providedPackages)
				);
				return source;
			}
			if (id.startsWith(bridgePrefix)) {
				const decoded = decodeBridgeId(id);
				return generateProvidedPackageBridge(
					planProvidedPackageBridge(decoded.key, decoded.usages)
				);
			}
			return null;
		},
		generateBundle(bundle) {
			const entries: Record<string, string> = {};
			for (const exposure of options.plan.exposures) {
				const output = Object.values(bundle).find(
					(value) =>
						value.type === 'chunk' && value.isEntry && value.facadeModuleId === exposure.entryId
				);
				if (!output)
					throw new Error(
						`Rollup did not emit remote exposure ${JSON.stringify(exposure.exposure)}`
					);
				entries[exposure.exposure] = output.fileName;
			}
			options.onEntries?.(Object.freeze(entries));
		}
	};
}

export { readExactMicrofrontendBuildConfig } from './plugin-config.js';
export { prepareExactRemoteArtifactBuild } from './project.js';
export type { ExactMicrofrontendBuildConfig } from './plugin-config.js';
export type { ExactPreparedRemoteArtifactBuild } from './project.js';

function componentId(root: string, exposure: ExactRemoteExposureArtifact): string {
	return scopedId(path.resolve(root, exposure.component), exposure.root);
}

function remoteScope(id: string, exposuresById: ReadonlyMap<string, unknown>): string | undefined {
	if (exposuresById.has(id)) return id;
	try {
		return new URLSearchParams(id.split('?')[1] ?? '').get(remoteScopeParameter) ?? undefined;
	} catch {
		return undefined;
	}
}

function scopedId(id: string, scope: string): string {
	const separator = id.includes('?') ? '&' : '?';
	const extension = path.extname(id.split('?', 1)[0] ?? '');
	const language = /^\.\w+$/.test(extension)
		? `&${remoteLanguageParameter}=${encodeURIComponent(extension)}`
		: '';
	return `${id}${separator}${remoteScopeParameter}=${encodeURIComponent(scope)}${language}`;
}

function unscopedId(id: string): string {
	const [pathname, query] = id.split('?', 2);
	if (!query) return id;
	const parameters = new URLSearchParams(query);
	parameters.delete(remoteScopeParameter);
	parameters.delete(remoteLanguageParameter);
	const remaining = parameters.toString();
	return remaining ? `${pathname}?${remaining}` : pathname!;
}

function entryName(exposure: string): string {
	const normalized = exposure.replace(/^\.\//, '').replace(/[^A-Za-z0-9_-]+/g, '-');
	return `exact-remote-${normalized || 'entry'}`;
}

function bridgeId(key: string, usages: readonly ExactProvidedPackageImportUsage[]): string {
	return `${bridgePrefix}${Buffer.from(JSON.stringify({ key, usages })).toString('base64url')}`;
}

function decodeBridgeId(id: string): {
	key: string;
	usages: ExactProvidedPackageImportUsage[];
} {
	try {
		return JSON.parse(Buffer.from(id.slice(bridgePrefix.length), 'base64url').toString('utf8'));
	} catch {
		throw new Error('Invalid eXact provided-package bridge id');
	}
}
