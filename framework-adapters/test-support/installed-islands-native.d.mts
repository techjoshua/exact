/** Runs installed-package hydration and updates against an owned native Fetch server. */
export function verifyNativeInstalledIslands(
	root: string,
	runtime: 'bun' | 'deno' | 'cloudflare'
): Promise<void>;
