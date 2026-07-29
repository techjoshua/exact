import type { ExactRuntimeSourceLocation } from '@exactjs/devtools-protocol';

/** Minimal DevTools resource shape used by exact-hash source resolution. */
export type ExactChromiumResource = Readonly<{
	url: string;
	getContent(callback: (content: string, encoding?: string) => void): void;
}>;

/**
 * Finds a loaded, source-mapped, or workspace resource only when its bytes match the build.
 *
 * Source-map style URLs are checked first, workspace file URLs second, and ordinary loaded
 * resources last. Server source excerpts remain the caller-owned final fallback.
 */
export async function findExactChromiumSourceResource(
	location: ExactRuntimeSourceLocation,
	resources: readonly ExactChromiumResource[]
): Promise<ExactChromiumResource | undefined> {
	const candidates = resources
		.filter((resource) => resourceMatchesPath(resource.url, location.path))
		.sort((left, right) => providerRank(left.url) - providerRank(right.url));
	for (const resource of candidates) {
		const content = await resourceContent(resource);
		if (content !== undefined && (await sha256(content)) === location.sourceHash) return resource;
	}
	return undefined;
}

/** Reads Chromium resources through the callback API supported by extension DevTools pages. */
export function chromiumResources(): Promise<readonly ExactChromiumResource[]> {
	return new Promise((resolve) =>
		chrome.devtools.inspectedWindow.getResources((resources) => resolve(resources))
	);
}

function resourceContent(resource: ExactChromiumResource): Promise<string | undefined> {
	return new Promise((resolve) => {
		try {
			resource.getContent((content) => resolve(typeof content === 'string' ? content : undefined));
		} catch {
			resolve(undefined);
		}
	});
}

async function sha256(content: string): Promise<string> {
	const bytes = new TextEncoder().encode(content);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resourceMatchesPath(url: string, expected: string): boolean {
	const normalizedExpected = normalize(expected);
	const normalizedUrl = normalize(decodeURIComponentSafe(url));
	return normalizedUrl === normalizedExpected || normalizedUrl.endsWith(`/${normalizedExpected}`);
}

function providerRank(url: string): number {
	if (/^(?:webpack|vite|ng|rollup):/i.test(url)) return 0;
	if (/^file:/i.test(url)) return 1;
	return 2;
}

function normalize(value: string): string {
	return value.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function decodeURIComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
