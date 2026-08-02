import type { ExactPreparedEnhancement } from '@exactjs/plugin-host/node';

/** Public virtual module used for the generated DOM enhancement facade. */
export const exactEnhancementDomModule = 'virtual:exact/enhancement-dom';

/** Internal resolved identifier for the generated DOM enhancement facade. */
export const resolvedExactEnhancementDomModule = `\0${exactEnhancementDomModule}`;

/** Emits a root-scoped DOM facade from the final application's trusted package catalog. */
export function createViteDomEnhancementFacade(
	enhancements: ReadonlyMap<string, ExactPreparedEnhancement>
): string {
	const entries = [...enhancements.values()].sort((left, right) =>
		left.identity.localeCompare(right.identity)
	);
	const imports = entries.map(
		(entry, index) => `import * as __exactEnhancement${index} from ${JSON.stringify(specifier(entry))};`
	);
	const catalogEntries = entries.map(
		(entry, index) =>
			`[${JSON.stringify(entry.identity)}, __exactEnhancement${index}[${JSON.stringify(entry.exportName)}]]`
	);
	return `${imports.join('\n')}
import { render as __exactRender } from '@exactjs/dom';
export * from '@exactjs/dom';

const __exactEnhancementCatalog = new Map([${catalogEntries.join(',')}]);

export function render(vnode, container, options) {
	return __exactRender(vnode, container, options?.enhancementCatalog
		? options
		: { ...options, enhancementCatalog: __exactEnhancementCatalog });
}
`;
}

function specifier(enhancement: ExactPreparedEnhancement): string {
	return enhancement.subpath === '.'
		? enhancement.packageName
		: `${enhancement.packageName}${enhancement.subpath.slice(1)}`;
}
