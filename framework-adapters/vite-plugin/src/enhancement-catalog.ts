import {
	exactEnhancementFacadeImports,
	prependExactEnhancementRegistrations
} from '@exactjs/compiler/adapter-support';
import type { ExactRendererEnhancementIR } from '@exactjs/compiler';

/** Runtime facades that supply the shared application-bundle enhancement catalog. */
export const exactEnhancementFacades = exactEnhancementFacadeImports;

/** Adds one generated catalog fragment for capabilities referenced by a compiled module. */
export function prependViteEnhancementRegistrations(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined
): string {
	return prependExactEnhancementRegistrations(code, enhancements);
}
