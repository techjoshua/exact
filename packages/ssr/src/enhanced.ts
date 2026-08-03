import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import * as ssr from './public.js';

export * from './public.js';

export const renderToString: typeof ssr.renderToString = (vnode, options) =>
	ssr.renderToString(vnode, withExactEnhancementCatalog(options));
export const renderToStringAsync: typeof ssr.renderToStringAsync = (vnode, options) =>
	ssr.renderToStringAsync(vnode, withExactEnhancementCatalog(options));
export const renderToHydratableString: typeof ssr.renderToHydratableString = (vnode, options) =>
	ssr.renderToHydratableString(vnode, withExactEnhancementCatalog(options));
export const renderToHydratableStringAsync: typeof ssr.renderToHydratableStringAsync = (
	vnode,
	options
) => ssr.renderToHydratableStringAsync(vnode, withExactEnhancementCatalog(options));
export const renderToStream: typeof ssr.renderToStream = (vnode, options) =>
	ssr.renderToStream(vnode, withExactEnhancementCatalog(options));
export const renderToDocumentStream: typeof ssr.renderToDocumentStream = (vnode, options) =>
	ssr.renderToDocumentStream(vnode, withExactEnhancementCatalog(options));
export const renderToHydratableDocumentStream: typeof ssr.renderToHydratableDocumentStream = (
	vnode,
	options
) => ssr.renderToHydratableDocumentStream(vnode, withExactEnhancementCatalog(options));
export const renderToProgressiveHtmlStream: typeof ssr.renderToProgressiveHtmlStream = (
	vnode,
	options
) => ssr.renderToProgressiveHtmlStream(vnode, withExactEnhancementCatalog(options));
export const renderToHydratableProgressiveHtmlStream: typeof ssr.renderToHydratableProgressiveHtmlStream =
	(vnode, options) =>
		ssr.renderToHydratableProgressiveHtmlStream(vnode, withExactEnhancementCatalog(options));
export const renderToProgressiveHtmlResponse: typeof ssr.renderToProgressiveHtmlResponse = (
	vnode,
	options
) => ssr.renderToProgressiveHtmlResponse(vnode, withExactEnhancementCatalog(options));
export const renderToHydratableProgressiveHtmlResponse: typeof ssr.renderToHydratableProgressiveHtmlResponse =
	(vnode, options) =>
		ssr.renderToHydratableProgressiveHtmlResponse(vnode, withExactEnhancementCatalog(options));
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
export const renderExactRequestToProgressiveHtmlResponse: typeof ssr.renderExactRequestToProgressiveHtmlResponse =
	(request, server, render, options) =>
		ssr.renderExactRequestToProgressiveHtmlResponse(
			request,
			server,
			render,
			withExactEnhancementCatalog(options)
		);
