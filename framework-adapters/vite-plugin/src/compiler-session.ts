import {
	createCompilerSession,
	resolveNativeCompilerExecutable,
	type ExactCompilerSession
} from '@exactjs/compiler';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createExactDiagnosticReporter } from '@exactjs/compiler/adapter-support';
import type { ExactPluginOptions } from './plugin-contracts.js';

type ExactViteBuildCompilerScope = {
	session?: ExactCompilerSession;
	onProfile?: ExactPluginOptions['onProfile'];
};

const buildCompilerScope = new AsyncLocalStorage<ExactViteBuildCompilerScope>();

/**
 * Runs sequential Vite builds inside one lazily created native compiler ownership scope.
 * The scope disposes its process after the complete client/server generation settles.
 */
export async function withExactViteBuildCompilerScope<Result>(
	run: () => Promise<Result>
): Promise<Result> {
	if (buildCompilerScope.getStore()) return run();
	const scope: ExactViteBuildCompilerScope = {};
	return buildCompilerScope.run(scope, async () => {
		try {
			return await run();
		} finally {
			scope.session?.dispose();
		}
	});
}

/** Owns replacement and disposal of the Vite plugin's diagnostics-sensitive compiler session. */
export class ExactViteCompilerSession {
	/** An attached development watcher owns file diagnostics before hot-update hooks run. */
	developmentWatchOwnsDiagnostics = false;
	#diagnostics: boolean;
	#session: ExactCompilerSession;
	#shared: boolean;
	#disposed = false;
	#reportDiagnostics = createExactDiagnosticReporter();

	constructor(
		enabled: boolean,
		private readonly onProfile: ExactPluginOptions['onProfile']
	) {
		this.#diagnostics = enabled;
		const scope = buildCompilerScope.getStore();
		if (scope && (!scope.session || scope.onProfile === onProfile)) {
			scope.onProfile ??= onProfile;
			this.#session = scope.session ??= this.create();
			this.#shared = true;
		} else {
			this.#session = this.create();
			this.#shared = false;
		}
	}

	/** Current compiler session used by transforms and invalidation. */
	get current(): ExactCompilerSession {
		if (this.#disposed) throw new Error('This eXact Vite compiler session has been disposed');
		return this.#session;
	}

	/** Registers retained TypeScript inputs with the owning build or development watcher. */
	observeProjectFiles(filename: string, add: (files: readonly string[]) => void): void {
		add(this.current.watchFiles(filename));
	}

	/** Checks a watched source, project change or removal and reports new diagnostics once. */
	diagnoseWatchChange(filename: string, removed: boolean, warn: (message: string) => void): void {
		this.#reportDiagnostics(this.current.invalidate(filename, removed), warn);
	}

	/** Standalone hot-update callers check sources. Attached Vite servers check in watchChange. */
	diagnoseHotUpdate(filename: string, warn: (message: string) => void): void {
		if (!this.developmentWatchOwnsDiagnostics) this.diagnoseWatchChange(filename, false, warn);
	}

	/** Replaces the session only when diagnostics mode changes. */
	configure(enabled: boolean): void {
		if (this.#disposed) throw new Error('This eXact Vite compiler session has been disposed');
		if (enabled === this.#diagnostics) return;
		if (!this.#shared) this.#session.dispose();
		this.#diagnostics = enabled;
		this.#session = this.create();
		this.#shared = false;
	}

	/** Releases the currently owned native session. */
	dispose(): void {
		if (this.#disposed) return;
		this.developmentWatchOwnsDiagnostics = false;
		if (!this.#shared) this.#session.dispose();
		this.#disposed = true;
	}

	private create(): ExactCompilerSession {
		return createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() },
			onProfile: this.onProfile
		});
	}
}
