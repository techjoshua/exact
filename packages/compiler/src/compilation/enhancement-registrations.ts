import type { ExactRendererEnhancementIR } from '../contracts/transform.js';

/** Renderer entry points redirected to application-bundle enhancement facades by build adapters. */
export const exactEnhancementFacadeImports = Object.freeze({
	'@exactjs/dom': '@exactjs/dom/enhanced',
	'@exactjs/hydrate': '@exactjs/hydrate/enhanced',
	'@exactjs/ssr': '@exactjs/ssr/enhanced'
} as const);

/** Adds imports and bundle-local registrations for compiler-observed enhancement capabilities. */
export function prependExactEnhancementRegistrations(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined
): string {
	if (!enhancements?.length) return code;
	const unique = new Map(enhancements.map((entry) => [entry.identity, entry] as const));
	const entries = [...unique.values()].sort((left, right) =>
		left.identity.localeCompare(right.identity)
	);
	const imports = entries.map(
		(entry, index) =>
			`import * as __exactEnhancement${index} from ${JSON.stringify(entry.moduleSpecifier)};`
	);
	const registrations = entries.map(
		(entry, index) =>
			`if (__exactEnhancement${index}[${JSON.stringify(entry.exportName)}] !== undefined) __exactRegisterEnhancement(${JSON.stringify(entry.identity)}, __exactEnhancement${index}[${JSON.stringify(entry.exportName)}]);`
	);
	return `${imports.join('\n')}
import { registerExactEnhancement as __exactRegisterEnhancement } from '@exactjs/core/framework/enhancement-catalog';
${registrations.join('\n')}
${code}`;
}
