import type { TransformTarget } from '@exactjs/compiler';

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Defines the subset of Vite options that controls module compilation eligibility. */
export type ExactModuleSelectionOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
	target?: TransformTarget;
	compileTestModules?: boolean;
};

/** Removes Vite query parameters while retaining virtual module identifiers. */
export function exactModuleFilename(id: string): string {
	return id.startsWith('\0') ? id : id.split('?', 1)[0]!;
}

/** Selects the concrete compiler target used by a client or server Vite build. */
export function exactTransformTarget(options: ExactModuleSelectionOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}
