import type { ExactRendererEnhancementIR } from '../contracts/transform.js';
import { exactEnhancementFacadeRequest } from './enhancement-facades.js';

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
			`import __exactEnhancement${index} from ${JSON.stringify(
				exactEnhancementFacadeRequest(entry)
			)};`
	);
	const registrations = entries.map(
		(entry, index) =>
			`__exactRegisterEnhancement(${JSON.stringify(entry.identity)}, __exactEnhancement${index});`
	);
	return `${imports.join('\n')}
import { registerExactEnhancement as __exactRegisterEnhancement } from '@exactjs/core/framework/enhancement-catalog';
${registrations.join('\n')}
${code}`;
}
