import { vi } from 'vitest';

/** Installs the unsupported-build response shared by client replacement tests. */
export function stubUnsupportedBuild(preferredBuildKey: string): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: false,
			status: 410,
			headers: new Headers({ 'X-Exact-Preferred-Build': preferredBuildKey }),
			async json() {
				return { error: 'exact_build_unsupported' };
			}
		}))
	);
}
