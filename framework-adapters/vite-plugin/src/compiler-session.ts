import {
	createCompilerSession,
	resolveNativeCompilerExecutable,
	type ExactCompilerSession
} from '@exactjs/compiler';
import type { ExactPluginOptions } from './plugin-contracts.js';

/** Owns replacement and disposal of the Vite plugin's diagnostics-sensitive compiler session. */
export class ExactViteCompilerSession {
	#diagnostics: boolean;
	#session: ExactCompilerSession;

	constructor(
		enabled: boolean,
		private readonly onProfile: ExactPluginOptions['onProfile']
	) {
		this.#diagnostics = enabled;
		this.#session = this.create();
	}

	/** Current compiler session used by transforms and invalidation. */
	get current(): ExactCompilerSession {
		return this.#session;
	}

	/** Replaces the session only when diagnostics mode changes. */
	configure(enabled: boolean): void {
		if (enabled === this.#diagnostics) return;
		this.#session.dispose();
		this.#diagnostics = enabled;
		this.#session = this.create();
	}

	/** Releases the currently owned native session. */
	dispose(): void {
		this.#session.dispose();
	}

	private create(): ExactCompilerSession {
		return createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() },
			onProfile: this.onProfile
		});
	}
}
