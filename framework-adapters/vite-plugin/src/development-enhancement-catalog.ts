import { randomUUID } from 'node:crypto';

const prefix = '\0exact:development-enhancement-catalog:';
const hostsKey = Symbol.for('exact.vite.development-enhancement-catalogs');

/**
 * Keeps each development environment's enhancement catalog coherent across overlapping module loads.
 * SSR ownership is scoped to this plugin. Browser reloads use core's normal catalog so Vite's
 * optimized DOM dependencies and authored components retain one browser catalog.
 * New module evaluations replace older providers, obsolete evaluations cannot overwrite them, and same-generation conflicts still fail.
 * Production builds continue using core's immutable application-bundle catalog.
 */
export class ExactViteDevelopmentEnhancementCatalog {
	readonly #identity = randomUUID();

	/** Selects the catalog facade only for development imports of the core catalog entry. */
	resolve(
		source: string,
		target: 'client' | 'server',
		command: 'build' | 'serve'
	): string | undefined {
		if (
			command !== 'serve' ||
			target !== 'server' ||
			source !== '@exactjs/core/framework/enhancement-catalog'
		)
			return;
		return `${prefix}${this.#identity}:${target}`;
	}

	/** Emits one stable catalog owner with a fresh evaluation generation for the selected target. */
	load(id: string): string | undefined {
		if (id !== `${prefix}${this.#identity}:server`) return;
		return `const key=Symbol.for('exact.vite.development-enhancement-catalogs');
const hosts=globalThis[key]??=new Map();
const identity=${JSON.stringify(id)};
let owner=hosts.get(identity);
if(!owner){owner={catalog:new Map(),providers:new Map(),generation:0};hosts.set(identity,owner);}
const generation=++owner.generation;
export const exactEnhancementCatalog=owner.catalog;
export function registerExactEnhancement(identity,component){
 if(typeof component!=='function')throw new TypeError('Renderer enhancement '+identity+' did not resolve to a component function');
 const previous=owner.providers.get(identity);
 if(previous?.generation>generation)return;
 if(previous?.generation===generation&&previous.component!==component)throw new Error('Conflicting renderer enhancement implementation for '+identity);
 owner.providers.set(identity,{generation,component});
 owner.catalog.set(identity,component);
}
export function withExactEnhancementCatalog(options){
 return options?.enhancementCatalog?options:{...options,enhancementCatalog:exactEnhancementCatalog};
}`;
	}

	/** Releases this plugin's server-side catalog owners when Vite closes or restarts. */
	dispose(): void {
		const globals = globalThis as unknown as Record<symbol, Map<string, unknown> | undefined>;
		const hosts = globals[hostsKey];
		if (!hosts) return;
		hosts.delete(`${prefix}${this.#identity}:server`);
		if (hosts.size === 0) delete globals[hostsKey];
	}
}
