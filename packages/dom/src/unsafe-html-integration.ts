import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from './renderer/unsafe-html.js';
import {
	registerUnsafeHtmlDomCapability,
	type UnsafeHtmlDomCapability
} from './renderer/unsafe-html-capability.js';

const unsafeHtmlDomCapability: UnsafeHtmlDomCapability = Object.freeze({
	assertAllowed: assertUnsafeHtmlAllowed,
	bind: bindUnsafeHtml
});

registerUnsafeHtmlDomCapability(unsafeHtmlDomCapability);
