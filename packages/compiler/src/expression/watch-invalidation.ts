/** Action the compiler session takes for one build-tool filesystem notification. */
export type ExactWatchInvalidationKind = 'source' | 'project' | 'ignore';

const sourceExtension = /\.[cm]?[jt]sx?$/i;
const projectConfiguration = /(?:^|[\\/])(?:(?:ts|js)config(?:\.[^\\/]+)?\.json|package\.json)$/i;

/**
 * Classifies broad build-tool watch notifications by their effect on a
 * TypeScript program.
 *
 * Source files can be diagnosed incrementally. Project configuration and JSON
 * modules require a program reset because they can alter parsing or module
 * resolution. Assets and generated metadata do not belong to the TypeScript
 * program and must not be sent to the native compiler.
 */
export function classifyExactWatchInvalidation(filename: string): ExactWatchInvalidationKind {
	const pathWithoutQuery = filename.split(/[?#]/, 1)[0]!;
	if (projectConfiguration.test(pathWithoutQuery) || /\.json$/i.test(pathWithoutQuery))
		return 'project';
	if (sourceExtension.test(pathWithoutQuery)) return 'source';
	return 'ignore';
}
