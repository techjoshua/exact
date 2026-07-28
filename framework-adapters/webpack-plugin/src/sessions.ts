import {
	createCompilerSession,
	resolveNativeCompilerExecutable,
	type ExactCompilerSession,
	type ExactCompilerSessionOptions
} from '@exactjs/compiler';

const sessions = new Map<string, ExactCompilerSession>();
let nextSessionId = 0;

/** Creates a webpack compiler session. */
export function createWebpackCompilerSession(
	enabled: boolean,
	compiler: 'native' | 'legacy' | undefined,
	onProfile?: ExactCompilerSessionOptions['onProfile']
): Readonly<{
	id: string;
	session: ExactCompilerSession;
}> {
	const id = `exact-webpack-${++nextSessionId}`;
	const session = createCompilerSession({
		languageService: enabled,
		...(compiler === 'legacy'
			? { compiler: 'legacy' as const }
			: { nativeCompiler: { executable: resolveNativeCompilerExecutable() } }),
		onProfile
	});
	sessions.set(id, session);
	return { id, session };
}

/** Performs the webpack compiler session domain operation. */
export function webpackCompilerSession(id: string | undefined): ExactCompilerSession | undefined {
	return id ? sessions.get(id) : undefined;
}

/** Performs the replace webpack compiler session domain operation. */
export function replaceWebpackCompilerSession(
	id: string,
	enabled: boolean,
	compiler: 'native' | 'legacy' | undefined,
	onProfile?: ExactCompilerSessionOptions['onProfile']
): ExactCompilerSession {
	sessions.get(id)?.dispose();
	const session = createCompilerSession({
		languageService: enabled,
		...(compiler === 'legacy'
			? { compiler: 'legacy' as const }
			: { nativeCompiler: { executable: resolveNativeCompilerExecutable() } }),
		onProfile
	});
	sessions.set(id, session);
	return session;
}

/** Releases webpack compiler session and its owned resources. */
export function disposeWebpackCompilerSession(id: string): void {
	sessions.get(id)?.dispose();
	sessions.delete(id);
}

/** Performs the webpack compiler session count domain operation. */
export function webpackCompilerSessionCount(): number {
	return sessions.size;
}
