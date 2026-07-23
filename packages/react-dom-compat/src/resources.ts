import { recordReactResourceHint } from '@exactjs/react-compat/exact';

/** Emits or records a preconnect resource hint for an origin. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	const crossOrigin = resourceCrossOrigin(options?.crossOrigin);
	if (
		recordReactResourceHint(
			`preconnect:${href}:${crossOrigin}`,
			20,
			`<link rel="preconnect" href="${escapeResource(href)}"${crossOrigin === undefined ? '' : ` crossorigin="${escapeResource(crossOrigin)}"`}/>`
		)
	)
		return;
	ensureLink('preconnect', href, options);
}

/** Emits or records a DNS-prefetch resource hint. */
export function prefetchDNS(href: string): void {
	if (
		recordReactResourceHint(
			`dns:${href}`,
			10,
			`<link href="${escapeResource(href)}" rel="dns-prefetch"/>`
		)
	)
		return;
	ensureLink('dns-prefetch', href);
}

/** Preinitializes a stylesheet or classic script resource. */
export function preinit(
	href: string,
	options: Record<string, unknown> & { as: 'style' | 'script' }
): void {
	if (options.as === 'style') {
		const precedence = options.precedence === undefined ? 'default' : String(options.precedence);
		const crossOrigin = resourceCrossOrigin(options.crossOrigin);
		const html = `<link rel="stylesheet" href="${escapeResource(href)}" data-precedence="${escapeResource(precedence)}"${crossOrigin === undefined ? '' : ` crossorigin="${escapeResource(crossOrigin)}"`}/>`;
		if (recordReactResourceHint(`style:${href}`, 40, html)) return;
		ensureLink('stylesheet', href, options);
	} else {
		const nonce =
			options.nonce === undefined ? '' : ` nonce="${escapeResource(String(options.nonce))}"`;
		if (
			recordReactResourceHint(
				`script:${href}`,
				50,
				`<script src="${escapeResource(href)}" async=""${nonce}></script>`
			)
		)
			return;
		ensureScript(href, false, options);
	}
}

/** Preinitializes an ECMAScript module resource. */
export function preinitModule(href: string, options?: Record<string, unknown>): void {
	const nonce =
		options?.nonce === undefined ? '' : ` nonce="${escapeResource(String(options.nonce))}"`;
	if (
		recordReactResourceHint(
			`module-script:${href}`,
			50,
			`<script src="${escapeResource(href)}" type="module" async=""${nonce}></script>`
		)
	)
		return;
	ensureScript(href, true, options);
}

/** Emits or records a preload hint for a typed resource. */
export function preload(href: string, options: Record<string, unknown> & { as: string }): void {
	const crossOrigin = resourceCrossOrigin(options.crossOrigin);
	const type = options.type === undefined ? '' : ` type="${escapeResource(String(options.type))}"`;
	const html = `<link rel="preload" href="${escapeResource(href)}" as="${escapeResource(options.as)}"${crossOrigin === undefined ? '' : ` crossorigin="${escapeResource(crossOrigin)}"`}${type}/>`;
	if (recordReactResourceHint(`preload:${options.as}:${href}`, 30, html)) return;
	ensureLink('preload', href, options);
}

/** Emits or records a modulepreload resource hint. */
export function preloadModule(href: string, options?: Record<string, unknown>): void {
	if (
		recordReactResourceHint(
			`modulepreload:${href}`,
			60,
			`<link rel="modulepreload" href="${escapeResource(href)}"/>`
		)
	)
		return;
	ensureLink('modulepreload', href, options);
}

function ensureLink(rel: string, href: string, options?: Record<string, unknown>): void {
	if (typeof document === 'undefined' || !href) return;
	const selector = `link[rel="${cssEscape(rel)}"][href="${cssEscape(href)}"]`;
	if (document.head.querySelector(selector)) return;
	const link = document.createElement('link');
	link.rel = rel;
	link.href = href;
	applyResourceOptions(link, options);
	document.head.appendChild(link);
}

function ensureScript(src: string, module: boolean, options?: Record<string, unknown>): void {
	if (typeof document === 'undefined' || !src) return;
	const selector = `script[src="${cssEscape(src)}"]${module ? '[type=module]' : ':not([type=module])'}`;
	if (document.head.querySelector(selector)) return;
	const script = document.createElement('script');
	script.src = src;
	if (module) script.type = 'module';
	applyResourceOptions(script, options);
	document.head.appendChild(script);
}

function applyResourceOptions(element: HTMLElement, options?: Record<string, unknown>): void {
	if (!options) return;
	const names: Record<string, string> = {
		as: 'as',
		crossOrigin: 'crossorigin',
		fetchPriority: 'fetchpriority',
		imageSizes: 'imagesizes',
		imageSrcSet: 'imagesrcset',
		integrity: 'integrity',
		nonce: 'nonce',
		referrerPolicy: 'referrerpolicy',
		type: 'type'
	};
	for (const [name, attribute] of Object.entries(names)) {
		const value = options[name];
		if (value !== undefined && value !== null) element.setAttribute(attribute, String(value));
	}
}

function cssEscape(value: string): string {
	return value.replace(/["\\]/g, (character) => `\\${character}`);
}

function resourceCrossOrigin(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	return value === 'use-credentials' ? 'use-credentials' : '';
}

function escapeResource(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
