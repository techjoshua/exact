import path from 'node:path';
import {
	generateProvidedPackageBridge,
	planProvidedPackageBridge,
	type ExactProvidedPackageImportUsage
} from './artifacts.js';
import type { ExactRemoteArtifactPlan } from './build.js';
import { acceptExactRemoteArtifactGeneration, type ExactRemoteAcceptedGeneration } from './build.js';

/**
 * Maps the neutral artifact plan into Bun entry, generated-module, and accepted-generation state.
 */
export function createExactRemoteBunAdapter(options: {
	plan: ExactRemoteArtifactPlan;
	applicationRoot: string;
	registrationModules: Readonly<Record<string, string>>;
	publicPath?: string;
	immutableOutputs?: boolean;
	onEntries?: (entries: Readonly<Record<string, string>>) => void;
	onDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
}) {
	let modules = new Map<string, string>();
	const pageBootstrapImport = 'virtual:exact-provided-packages';
	const pageBootstrapInternalId = '\0exact:provided/bootstrap';
	modules.set(pageBootstrapInternalId, options.plan.providedBootstrapSource);
	const entrypoints: string[] = [];
	const exposureByEntry = new Map<string, string>();
	for (const exposure of options.plan.exposures) {
		entrypoints.push(bunVirtualId(exposure.entryId));
		exposureByEntry.set(bunVirtualId(exposure.entryId), exposure.exposure);
		modules.set(exposure.entryId, exposure.entrySource);
		modules.set(
			exposure.componentFacadeId,
			`export { default } from ${JSON.stringify(scopedComponent(options.applicationRoot, exposure.component, exposure.root))};\n`
		);
		const registration = options.registrationModules[exposure.exposure];
		if (!registration)
			throw new Error(
				`Missing hydration registration for remote exposure ${JSON.stringify(exposure.exposure)}`
			);
		modules.set(exposure.registrationId, registration);
	}
	const internalIds = [...modules.keys()];
	modules = new Map(
		[...modules].map(([id, source]) => [
			bunVirtualId(id),
			internalIds.reduce(
				(value, internal) =>
					value.replaceAll(JSON.stringify(internal), JSON.stringify(bunVirtualId(internal))),
				source
			)
		])
	);
	const pageBootstrapId = bunVirtualId(pageBootstrapInternalId);
	let generation = 0;
	let accepted: ExactRemoteAcceptedGeneration | undefined;
	let disposed = false;
	const developmentEntries = Object.freeze(
		Object.fromEntries(options.plan.exposures.map((value) => [value.exposure, bunVirtualId(value.entryId)]))
	);
	options.onDevelopmentEntries?.(developmentEntries);
	return Object.freeze({
		pageBootstrapImport,
		pageBootstrapId,
		entrypoints: Object.freeze(entrypoints),
		developmentEntries,
		namespace: 'exact-remote-artifact' as const,
		ownsRemoteModule(pathname: string): boolean {
			return pathname !== pageBootstrapId && modules.has(pathname);
		},
		onResolve(pathname: string): { path: string; namespace: string } | undefined {
			if (pathname === pageBootstrapImport) pathname = pageBootstrapId;
			return modules.has(pathname)
				? { path: pathname, namespace: 'exact-remote-artifact' }
				: undefined;
		},
		onLoad(pathname: string): { contents: string; loader: 'js' } | undefined {
			const contents = modules.get(pathname);
			return contents === undefined ? undefined : { contents, loader: 'js' };
		},
		beginGeneration(): number {
			if (disposed) throw new Error('Cannot begin a disposed Bun remote generation');
			return ++generation;
		},
		acceptGeneration(
			token: number,
			outputs: readonly Readonly<{ entrypoint?: string; path: string; kind: 'entry' | 'chunk' | 'css' | 'asset' }>[]
		): ExactRemoteAcceptedGeneration {
			if (disposed || token !== generation) throw new Error('Cannot accept a stale Bun remote generation');
			const emitted: Record<string, string> = {};
			for (const output of outputs) {
				const exposure = output.entrypoint ? exposureByEntry.get(output.entrypoint) : undefined;
				if (exposure && output.kind === 'entry') emitted[exposure] = output.path;
			}
			accepted = acceptExactRemoteArtifactGeneration(options.plan, {
				entries: emitted,
				publicPath: options.publicPath,
				immutable: options.immutableOutputs ?? true,
				css: outputs.filter((value) => value.kind === 'css').map((value) => value.path),
				assets: outputs.filter((value) => value.kind === 'asset').map((value) => value.path),
				chunks: outputs.filter((value) => value.kind === 'chunk').map((value) => value.path)
			});
			options.onEntries?.(accepted.entries);
			return accepted;
		},
		rejectGeneration(token: number): void {
			if (token === generation) generation++;
		},
		acceptedGeneration(): ExactRemoteAcceptedGeneration | undefined {
			return accepted;
		},
		dispose(): void {
			disposed = true;
			generation++;
			accepted = undefined;
			modules.clear();
		},
		providedBridge(
			key: string,
			usages: readonly ExactProvidedPackageImportUsage[]
		): { contents: string; loader: 'js' } {
			if (!options.plan.providedPackages.includes(key))
				throw new Error(`Package ${JSON.stringify(key)} is not configured as provided`);
			return {
				contents: generateProvidedPackageBridge(planProvidedPackageBridge(key, usages)),
				loader: 'js'
			};
		},
		registerProvidedBridge(
			key: string,
			usages: readonly ExactProvidedPackageImportUsage[]
		): { path: string; namespace: string } {
			const bridge = this.providedBridge(key, usages);
			const id = bunVirtualId(`provided:${Buffer.from(JSON.stringify({ key, usages })).toString('base64url')}`);
			modules.set(id, bridge.contents);
			return { path: id, namespace: 'exact-remote-artifact' };
		}
	});
}

function scopedComponent(root: string, component: string, scope: string): string {
	return `${path.resolve(root, component).replaceAll('\\', '/')}?exact-remote-scope=${encodeURIComponent(scope)}`;
}

function bunVirtualId(id: string): string {
	return `exact-remote:${Buffer.from(id).toString('base64url')}`;
}

/** @deprecated Use createExactRemoteBunAdapter. */
export const createExactBunFeasibilityMapping = createExactRemoteBunAdapter;
