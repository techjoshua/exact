import {
	adoptUnsafeHtmlReceipt,
	assertUnsafeHtmlAllowed,
	bindUnsafeHtml,
	mountUnsafeHtmlReceipt
} from './renderer/unsafe-html.js';
import {
	registerUnsafeHtmlDomCapability,
	type UnsafeHtmlDomCapability
} from './renderer/unsafe-html-capability.js';

const unsafeHtmlDomCapability: UnsafeHtmlDomCapability = Object.freeze({
	mount: mountUnsafeHtmlReceipt,
	adopt: adoptUnsafeHtmlReceipt,
	assertAllowed: assertUnsafeHtmlAllowed,
	bind: bindUnsafeHtml
});

/** Installs native unsafe-HTML operation handling. */
export function installUnsafeHtmlIntegration(): void {
	registerUnsafeHtmlDomCapability(unsafeHtmlDomCapability);
}
