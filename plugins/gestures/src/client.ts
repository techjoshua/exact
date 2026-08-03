import type { ExactRuntimePluginExtension } from '@exactjs/plugin-api';

/** Creates the browser-safe gesture runtime extension. */
export default function createGestureClientExtension(): ExactRuntimePluginExtension {
	return Object.freeze({});
}
