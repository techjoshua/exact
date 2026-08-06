import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import * as ssr from './public.js';

export * from './public.js';

/** Renders one vnode tree with the application enhancement catalog available during synchronous SSR. */
export const renderToString: typeof ssr.renderToString = (vnode, options) =>
	ssr.renderToString(vnode, withExactEnhancementCatalog(options));
/** Renders an asynchronously resolved vnode tree with application enhancements enabled. */
export const renderToStringAsync: typeof ssr.renderToStringAsync = (vnode, options) =>
	ssr.renderToStringAsync(vnode, withExactEnhancementCatalog(options));
/** Renders synchronous HTML plus hydration contracts using the application enhancement catalog. */
export const renderToHydratableString: typeof ssr.renderToHydratableString = (vnode, options) =>
	ssr.renderToHydratableString(vnode, withExactEnhancementCatalog(options));
/** Renders asynchronous HTML plus hydration contracts using the application enhancement catalog. */
export const renderToHydratableStringAsync: typeof ssr.renderToHydratableStringAsync = (
	vnode,
	options
) => ssr.renderToHydratableStringAsync(vnode, withExactEnhancementCatalog(options));
/** Streams a vnode tree while resolving enhancement implementations from the application catalog. */
export const renderToStream: typeof ssr.renderToStream = (vnode, options) =>
	ssr.renderToStream(vnode, withExactEnhancementCatalog(options));
/** Streams a complete HTML document with application enhancements enabled. */
export const renderToDocumentStream: typeof ssr.renderToDocumentStream = (vnode, options) =>
	ssr.renderToDocumentStream(vnode, withExactEnhancementCatalog(options));
/** Streams a hydratable HTML document with application enhancement metadata. */
export const renderToHydratableDocumentStream: typeof ssr.renderToHydratableDocumentStream = (
	vnode,
	options
) => ssr.renderToHydratableDocumentStream(vnode, withExactEnhancementCatalog(options));
/** Progressively streams HTML while application enhancement work and async content settle. */
export const renderToProgressiveHtmlStream: typeof ssr.renderToProgressiveHtmlStream = (
	vnode,
	options
) => ssr.renderToProgressiveHtmlStream(vnode, withExactEnhancementCatalog(options));
/** Progressively streams hydratable HTML with application enhancement metadata. */
export const renderToHydratableProgressiveHtmlStream: typeof ssr.renderToHydratableProgressiveHtmlStream =
	(vnode, options) =>
		ssr.renderToHydratableProgressiveHtmlStream(vnode, withExactEnhancementCatalog(options));
/** Creates a progressive HTML response whose render can resolve application enhancements. */
export const renderToProgressiveHtmlResponse: typeof ssr.renderToProgressiveHtmlResponse = (
	vnode,
	options
) => ssr.renderToProgressiveHtmlResponse(vnode, withExactEnhancementCatalog(options));
/** Creates a hydratable progressive response carrying application enhancement metadata. */
export const renderToHydratableProgressiveHtmlResponse: typeof ssr.renderToHydratableProgressiveHtmlResponse =
	(vnode, options) =>
		ssr.renderToHydratableProgressiveHtmlResponse(vnode, withExactEnhancementCatalog(options));
/** Handles one eXact server request and renders its HTML with application enhancements enabled. */
export const renderExactRequestToHtmlResponse: typeof ssr.renderExactRequestToHtmlResponse = (
	request,
	server,
	render,
	options
) =>
	ssr.renderExactRequestToHtmlResponse(
		request,
		server,
		render,
		withExactEnhancementCatalog(options)
	);
/** Handles one eXact server request as a progressive response with application enhancements enabled. */
export const renderExactRequestToProgressiveHtmlResponse: typeof ssr.renderExactRequestToProgressiveHtmlResponse =
	(request, server, render, options) =>
		ssr.renderExactRequestToProgressiveHtmlResponse(
			request,
			server,
			render,
			withExactEnhancementCatalog(options)
		);
