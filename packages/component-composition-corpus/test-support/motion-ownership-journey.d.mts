/** Checks prepared definitions, mutable aliases and retained structural timing validation. */
export function verifyMotionValues(api: {
	defineMotion: typeof import('../../../component-libraries/motion/src/definitions.js').defineMotion;
	resolveMotionEffect: typeof import('../../../component-libraries/motion/src/playback.js').resolveMotionEffect;
	createViewTransitionCoordinator: typeof import('../../../component-libraries/motion/src/view-transition.js').createViewTransitionCoordinator;
	defaultMotionSettings: typeof import('../../../component-libraries/motion/src/context.js').defaultMotionSettings;
	createWebAnimationDriver: typeof import('../../../component-libraries/motion/src/driver.js').createWebAnimationDriver;
}): true;

/** Checks exact cancellation reasons, stale frames, subsequent progress and listener cleanup. */
export function verifyMotionPlacement(api: {
	animate: typeof import('../../../component-libraries/motion/src/playback.js').animate;
	createWebAnimationDriver: typeof import('../../../component-libraries/motion/src/driver.js').createWebAnimationDriver;
}): Promise<true>;
