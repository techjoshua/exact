import type { ExactRendererEnhancementIR } from '@exactjs/compiler';

/** Public virtual module used for the generated DOM enhancement facade. */
export const exactEnhancementDomModule = 'virtual:exact/enhancement-dom';

/** Internal resolved identifier for the generated DOM enhancement facade. */
export const resolvedExactEnhancementDomModule = `\0${exactEnhancementDomModule}`;

/** Public virtual module used for the generated hydration enhancement facade. */
export const exactEnhancementHydrateModule = 'virtual:exact/enhancement-hydrate';

/** Internal resolved identifier for the generated hydration enhancement facade. */
export const resolvedExactEnhancementHydrateModule = `\0${exactEnhancementHydrateModule}`;

/** Public virtual module used for the generated SSR enhancement facade. */
export const exactEnhancementSsrModule = 'virtual:exact/enhancement-ssr';

/** Internal resolved identifier for the generated SSR enhancement facade. */
export const resolvedExactEnhancementSsrModule = `\0${exactEnhancementSsrModule}`;

/** Bundle-local catalog populated only by compiler-observed attributed imports. */
export const exactEnhancementCatalogModule = 'virtual:exact/enhancement-catalog';

/** Internal resolved identifier for the bundle-local enhancement catalog. */
export const resolvedExactEnhancementCatalogModule = `\0${exactEnhancementCatalogModule}`;

/** Emits the bundle-local catalog implementation shared by module fragments and renderer roots. */
export function createViteEnhancementCatalogRuntime(): string {
	return `export const exactEnhancementCatalog = new Map();
export function registerExactEnhancement(identity, component) {
	const current = exactEnhancementCatalog.get(identity);
	if (current && current !== component)
		throw new Error(\`Conflicting renderer enhancement implementation for \${identity}\`);
	if (typeof component !== 'function')
		throw new TypeError(\`Renderer enhancement \${identity} did not resolve to a component function\`);
	exactEnhancementCatalog.set(identity, component);
}
`;
}

/** Emits a DOM facade that passes this application bundle's catalog into each renderer root. */
export function createViteDomEnhancementFacade(): string {
	return `import { exactEnhancementCatalog } from '${exactEnhancementCatalogModule}';
import { render as __exactRender } from '@exactjs/dom';
export * from '@exactjs/dom';

export function render(vnode, container, options) {
	return __exactRender(vnode, container, options?.enhancementCatalog
		? options
		: { ...options, enhancementCatalog: exactEnhancementCatalog });
}
`;
}

/** Emits a hydration facade that activates this application bundle's catalog after adoption. */
export function createViteHydrateEnhancementFacade(): string {
	return `import { exactEnhancementCatalog } from '${exactEnhancementCatalogModule}';
import { hydrate as __exactHydrate } from '@exactjs/hydrate';
export * from '@exactjs/hydrate';

export function hydrate(vnode, container, options) {
	return __exactHydrate(vnode, container, options?.enhancementCatalog
		? options
		: { ...options, enhancementCatalog: exactEnhancementCatalog });
}
`;
}

/** Emits an SSR facade that supplies this server bundle's enhancement catalog. */
export function createViteSsrEnhancementFacade(): string {
	const vnodeRenderers = [
		'renderToString',
		'renderToStringAsync',
		'renderToHydratableString',
		'renderToHydratableStringAsync',
		'renderToStream',
		'renderToDocumentStream',
		'renderToHydratableDocumentStream',
		'renderToProgressiveHtmlStream',
		'renderToHydratableProgressiveHtmlStream',
		'renderToProgressiveHtmlResponse',
		'renderToHydratableProgressiveHtmlResponse'
	];
	const requestRenderers = [
		'renderExactRequestToHtmlResponse',
		'renderExactRequestToProgressiveHtmlResponse'
	];
	const imports = [...vnodeRenderers, ...requestRenderers]
		.map((name) => `${name} as __exact_${name}`)
		.join(',\n\t');
	const vnodeFunctions = vnodeRenderers
		.map(
			(name) =>
				`export function ${name}(vnode, options) { return __exact_${name}(vnode, __exactOptions(options)); }`
		)
		.join('\n');
	const requestFunctions = requestRenderers
		.map(
			(name) =>
				`export function ${name}(request, server, render, options) { return __exact_${name}(request, server, render, __exactOptions(options)); }`
		)
		.join('\n');
	return `import { exactEnhancementCatalog } from '${exactEnhancementCatalogModule}';
import {
	${imports}
} from '@exactjs/ssr';
export * from '@exactjs/ssr';

function __exactOptions(options) {
	return options?.enhancementCatalog
		? options
		: { ...options, enhancementCatalog: exactEnhancementCatalog };
}
${vnodeFunctions}
${requestFunctions}
`;
}

/** Adds one generated catalog fragment for capabilities referenced by a compiled module. */
export function prependViteEnhancementRegistrations(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined
): string {
	if (!enhancements?.length) return code;
	const unique = new Map(enhancements.map((entry) => [entry.identity, entry] as const));
	const entries = [...unique.values()].sort((left, right) => left.identity.localeCompare(right.identity));
	const imports = entries.map(
		(entry, index) =>
			`import * as __exactEnhancement${index} from ${JSON.stringify(entry.moduleSpecifier)};`
	);
	const registrations = entries.map(
		(entry, index) =>
			`__exactRegisterEnhancement(${JSON.stringify(entry.identity)}, __exactEnhancement${index}[${JSON.stringify(entry.exportName)}]);`
	);
	return `${imports.join('\n')}
import { registerExactEnhancement as __exactRegisterEnhancement } from '${exactEnhancementCatalogModule}';
${registrations.join('\n')}
${code}`;
}
