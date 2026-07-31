import {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	createExactInspectionRedactions,
	type ExactCompilerManifest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import path from 'node:path';

/** Public virtual-module identifier used to install the page inspection runtime. */
export const exactDevtoolsRuntimeModule = 'virtual:exact/devtools-runtime';
/** Internal Vite resolution identifier for the page inspection runtime module. */
export const resolvedExactDevtoolsRuntimeModule = `\0${exactDevtoolsRuntimeModule}`;

/** Controls build catalogs, runtime instrumentation, identity, and inspection redaction. */
export type ViteDebugOptions = {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

type InspectionModule = Readonly<{
	inspection: ExactSourceInspection;
	manifest: ExactCompilerManifest;
	source: string;
}>;

/** Prepends the page-world runtime dependency to an instrumented module. */
export function prependViteDevtoolsRuntimeImport(code: string, enabled: boolean): string {
	return enabled ? `import '${exactDevtoolsRuntimeModule}';\n${code}` : code;
}

/** Emits the virtual module that installs the browser inspection runtime once. */
export function exactDevtoolsRuntimeBootstrap(debug: ViteDebugOptions | undefined): string {
	return `import { installExactDevtoolsRuntime } from '@exactjs/devtools-runtime';
const key = Symbol.for('@exactjs/devtools-installation');
globalThis[key] ??= installExactDevtoolsRuntime(${JSON.stringify({
		buildKey: debug?.buildKey ?? 'development',
		executionRoot: debug?.executionRoot ?? debug?.rootComponentId ?? 'page',
		...(debug?.redactions ? { redactions: debug.redactions } : {})
	})});
`;
}

/** Inserts a runtime module before the first application module script. */
export function injectModuleBootstrap(html: string, moduleId: string): string {
	const bootstrap = `<script type="module" src=${JSON.stringify(moduleId)}></script>`;
	const firstModule = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>/i;
	if (firstModule.test(html)) return html.replace(firstModule, `${bootstrap}$&`);
	const body = /<\/body\s*>/i;
	if (body.test(html)) return html.replace(body, `${bootstrap}$&`);
	return `${html}${bootstrap}`;
}

/** Resolves whether server-owned catalog output is enabled for this Vite command. */
export function inspectionCatalogEnabled(
	debug: ViteDebugOptions | undefined,
	command: 'build' | 'serve'
): boolean {
	const value = debug?.catalog ?? 'auto';
	return value === true || (value === 'auto' && command === 'serve');
}

/** Resolves whether compact client inspection output is enabled for this Vite command. */
export function inspectionRuntimeEnabled(
	debug: ViteDebugOptions | undefined,
	command: 'build' | 'serve'
): boolean {
	const value = debug?.runtime ?? 'auto';
	return value === true || (value === 'auto' && command === 'serve');
}

/** Builds one Vite-owned inspection catalog from transformed module results. */
export function createViteInspectionCatalog(
	applicationRoot: string | undefined,
	debug: ViteDebugOptions | undefined,
	modules: ReadonlyMap<string, InspectionModule>,
	command: 'build' | 'serve'
) {
	if (!modules.size) return undefined;
	const root = path.resolve(applicationRoot ?? process.cwd());
	const entries = [...modules.entries()].map(([filename, entry]) => ({
		filename,
		source: entry.source
	}));
	const buildKey =
		debug?.buildKey ??
		(command === 'serve' ? 'development' : createExactInspectionBuildKey(root, entries));
	const inspections = [...modules.values()].map((entry) => entry.inspection);
	const rootComponentId =
		debug?.rootComponentId ?? inspections.flatMap((inspection) => inspection.components)[0]?.id;
	if (!rootComponentId) return undefined;
	const sources = Object.fromEntries(
		[...modules.entries()].map(([filename, entry]) => [filename, entry.source])
	);
	return createExactBuildInspectionCatalog({
		buildKey,
		root,
		...(debug?.producer ? { producer: debug.producer } : {}),
		roots: [
			{
				executionRoot: debug?.executionRoot ?? rootComponentId,
				rootComponentId,
				inspections,
				sources,
				redactions: createExactInspectionRedactions(
					[...modules.values()].map((entry) => entry.manifest),
					debug?.redactions
				)
			}
		]
	});
}

/** Rejects mutable production debug identities. */
export function validateViteDebugIdentity(
	debug: ViteDebugOptions | undefined,
	command: 'build' | 'serve'
): void {
	if (
		command === 'build' &&
		(debug?.catalog === true || debug?.runtime === true) &&
		!debug.buildKey
	)
		throw new Error(
			'eXact production DevTools output requires one explicit immutable debug.buildKey'
		);
}
