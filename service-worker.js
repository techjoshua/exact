/* global caches, self */

const cachePrefix = 'sudoku-atelier-';
const cacheName = `${cachePrefix}v1`;
const entryFile = './sudoku.html';
const startFile = './sudoku.html';
const shellFiles = [
	startFile,
	entryFile,
	'./manifest.webmanifest',
	'./sudoku-icon.svg',
	'./sudoku-icon-192.png',
	'./sudoku-icon-512.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(installAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
						.map((name) => caches.delete(name))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;

	if (event.request.mode === 'navigate') {
		const entryPath = new URL(entryFile, self.registration.scope).pathname;
		const startPath = new URL(startFile, self.registration.scope).pathname;
		if (url.pathname !== entryPath && url.pathname !== startPath) return;

		event.respondWith(
			fetch(event.request)
				.then((response) => {
					if (response.ok) {
						event.waitUntil(cacheEntryPage(event.request, response.clone()));
					}
					return response;
				})
				.catch(() => caches.match(event.request).then((cached) => cached ?? cachedEntryPage()))
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;
			return fetch(event.request);
		})
	);
});

/**
 * Installs the declared shell and discovers Vite's hashed assets from its HTML.
 * Missing entry aliases are tolerated so one worker supports both distributions.
 */
async function installAppShell() {
	const cache = await caches.open(cacheName);
	const discoveredAssets = new Set();

	for (const path of shellFiles) {
		try {
			const response = await fetch(path, { cache: 'reload' });
			if (!response.ok) continue;
			await cache.put(path, response.clone());
			if (response.headers.get('content-type')?.includes('text/html')) {
				for (const asset of assetsFromHtml(await response.text())) discoveredAssets.add(asset);
			}
		} catch {
			// Optional shell resources must not prevent the rest of the app from installing.
		}
	}

	await Promise.all(
		[...discoveredAssets].map(async (asset) => {
			const response = await fetch(asset, { cache: 'reload' });
			if (response.ok) await cache.put(asset, response);
		})
	);
}

/** Returns same-scope scripts, styles, manifests, and icons referenced by the shell. */
function assetsFromHtml(html) {
	const assets = [];
	for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
		const url = new URL(match[1], self.registration.scope);
		if (
			url.origin === self.location.origin &&
			url.pathname.startsWith(new URL(self.registration.scope).pathname)
		) {
			assets.push(url.href);
		}
	}
	return assets;
}

/** Refreshes an entry page and all same-scope assets referenced by that page. */
async function cacheEntryPage(key, response) {
	const cache = await caches.open(cacheName);
	await cache.put(key, response.clone());
	const assets = assetsFromHtml(await response.text());
	await Promise.all(
		assets.map(async (asset) => {
			const assetResponse = await fetch(asset, { cache: 'reload' });
			if (assetResponse.ok) await cache.put(asset, assetResponse);
		})
	);
}

/** Resolves the installed entry point for an offline navigation. */
async function cachedEntryPage() {
	const cache = await caches.open(cacheName);
	return (await cache.match(startFile)) ?? (await cache.match(entryFile));
}
