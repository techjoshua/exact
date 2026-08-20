import type { ComponentFunction } from '../component/contracts.js';

type EnhancementComponent = ComponentFunction<Record<string, never>, Record<string, unknown>>;

const catalog = new Map<string, EnhancementComponent>();

/** Application-bundle-local enhancement components observed by a build adapter. */
export const exactEnhancementCatalog: ReadonlyMap<string, EnhancementComponent> = catalog;

/** Adds one compiler-observed package capability to the current application bundle. */
export function registerExactEnhancement(identity: string, component: unknown): void {
	const current = catalog.get(identity);
	if (current && current !== component)
		throw new Error(`Conflicting renderer enhancement implementation for ${identity}`);
	if (typeof component !== 'function')
		throw new TypeError(`Renderer enhancement ${identity} did not resolve to a component function`);
	catalog.set(identity, component as EnhancementComponent);
}

/** Supplies the bundle catalog unless a renderer caller provided an explicit catalog. */
export function withExactEnhancementCatalog<Options extends Readonly<Record<string, unknown>>>(
	options: Options | undefined
): Options & Readonly<{ enhancementCatalog: ReadonlyMap<string, EnhancementComponent> }> {
	return (
		(
			options as
				| Readonly<{ enhancementCatalog?: ReadonlyMap<string, EnhancementComponent> }>
				| undefined
		)?.enhancementCatalog
			? options
			: { ...options, enhancementCatalog: exactEnhancementCatalog }
	) as Options & Readonly<{ enhancementCatalog: ReadonlyMap<string, EnhancementComponent> }>;
}
