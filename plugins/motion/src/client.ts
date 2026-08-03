import type { ExactRuntimePluginExtension } from '@exactjs/plugin-api';
import { createWebAnimationDriver, installMotionDriver } from './driver.js';

/** Installs the browser Web Animations driver for one application lifetime. */
export default function createMotionClientExtension(): ExactRuntimePluginExtension {
	return Object.freeze({
		initializeApplication() {
			const restore = installMotionDriver(createWebAnimationDriver());
			return { dispose: restore };
		}
	});
}
