import path from 'node:path';
import {
	generateProvidedPackageBridge,
	planProvidedPackageBridge,
	type ExactProvidedPackageImportUsage
} from './artifacts.js';
import type { ExactRemoteArtifactPlan } from './build.js';
import {
	acceptExactRemoteArtifactGeneration,
	type ExactRemoteAcceptedGeneration
} from './build.js';

/**
 * Maps the neutral artifact plan into Webpack entry, virtual-module, and accepted-generation state.
 */
export function createExactRemoteWebpackAdapter(options: {
	plan: ExactRemoteArtifactPlan;
	applicationRoot: string;
	registrationModules: Readonly<Record<string, string>>;
	publicPath?: string;
	immutableOutputs?: boolean;
	onEntries?: (entries: Readonly<Record<string, string>>) => void;
	onDevelopmentEntries?: (entries: Readonly<Record<string, string>>) => void;
}) {
	const modules = new Map<string, string>();
	const pageBootstrapImport = 'virtual:exact-provided-packages';
	const pageBootstrapId = '\0exact:provided/bootstrap';
	modules.set(pageBootstrapId, options.plan.providedBootstrapSource);
	const entries: Record<string, string> = {};
	const exposureByEntry = new Map<string, string>();
	for (const exposure of options.plan.exposures) {
		const name = exposure.exposure.replace(/^\.\//, '').replace(/[^A-Za-z0-9_-]+/g, '-');
		const entryName = `exact-remote-${name || 'entry'}`;
		entries[entryName] = exposure.entryId;
		exposureByEntry.set(entryName, exposure.exposure);
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
	let generation = 0;
	let accepted: ExactRemoteAcceptedGeneration | undefined;
	let disposed = false;
	const developmentEntries = Object.freeze(
		Object.fromEntries(
			options.plan.exposures.map((exposure) => [
				exposure.exposure,
				`virtual:exact-remote-entry/${Buffer.from(exposure.exposure).toString('base64url')}`
			])
		)
	);
	options.onDevelopmentEntries?.(developmentEntries);
	return Object.freeze({
		pageBootstrapImport,
		pageBootstrapId,
		entries: Object.freeze(entries),
		developmentEntries,
		output: Object.freeze({
			module: true,
			chunkFormat: 'module' as const,
			chunkLoading: 'import' as const,
			publicPath: 'auto' as const
		}),
		loadVirtualModule(id: string): string | undefined {
			if (id === pageBootstrapImport) id = pageBootstrapId;
			return modules.get(id);
		},
		beginGeneration(): number {
			if (disposed) throw new Error('Cannot begin a disposed Webpack remote generation');
			return ++generation;
		},
		acceptGeneration(
			token: number,
			outputs: readonly Readonly<{
				name?: string;
				fileName: string;
				type: 'entry' | 'chunk' | 'css' | 'asset';
			}>[]
		): ExactRemoteAcceptedGeneration {
			if (disposed || token !== generation)
				throw new Error('Cannot accept a stale Webpack remote generation');
			const emitted: Record<string, string> = {};
			for (const output of outputs) {
				const exposure = output.name ? exposureByEntry.get(output.name) : undefined;
				if (exposure && output.type === 'entry') emitted[exposure] = output.fileName;
			}
			accepted = acceptExactRemoteArtifactGeneration(options.plan, {
				entries: emitted,
				publicPath: options.publicPath,
				immutable: options.immutableOutputs ?? true,
				css: outputs.filter((value) => value.type === 'css').map((value) => value.fileName),
				assets: outputs.filter((value) => value.type === 'asset').map((value) => value.fileName),
				chunks: outputs.filter((value) => value.type === 'chunk').map((value) => value.fileName)
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
		providedBridge(key: string, usages: readonly ExactProvidedPackageImportUsage[]): string {
			if (!options.plan.providedPackages.includes(key))
				throw new Error(`Package ${JSON.stringify(key)} is not configured as provided`);
			return generateProvidedPackageBridge(planProvidedPackageBridge(key, usages));
		}
	});
}

function scopedComponent(root: string, component: string, scope: string): string {
	return `${path.resolve(root, component)}?exact-remote-scope=${encodeURIComponent(scope)}`;
}

/**
 * Maps the neutral artifact plan to Webpack using the former feasibility API name.
 *
 * @deprecated Use createExactRemoteWebpackAdapter; retained as a source-compatible migration alias.
 */
export const createExactWebpackFeasibilityMapping = createExactRemoteWebpackAdapter;
