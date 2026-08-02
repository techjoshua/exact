import type { MotionDriver, MotionEffect } from './contracts.js';

const noMotionDriver: MotionDriver = Object.freeze({
	async play(_element: Element, _effect: MotionEffect, signal: AbortSignal) {
		if (signal.aborted) throw signal.reason;
	}
});

let activeDriver: MotionDriver = noMotionDriver;

/** Returns the environment driver currently installed for motion playback. */
export function motionDriver(): MotionDriver {
	return activeDriver;
}

/** Installs an environment driver and returns a function that restores the previous driver. */
export function installMotionDriver(driver: MotionDriver): () => void {
	if (!driver || typeof driver.play !== 'function')
		throw new TypeError('A motion driver must implement play()');
	const previous = activeDriver;
	activeDriver = driver;
	return () => {
		if (activeDriver === driver) activeDriver = previous;
	};
}

/** Creates the browser Web Animations driver without reading browser globals during import. */
export function createWebAnimationDriver(): MotionDriver {
	return Object.freeze({
		async play(element: Element, effect: MotionEffect, signal: AbortSignal): Promise<void> {
			if (signal.aborted) throw signal.reason;
			if (typeof element.animate !== 'function') return;
			const animation = element.animate(effect.keyframes, {
				fill: 'both',
				...effect.options
			});
			const cancel = () => animation.cancel();
			signal.addEventListener('abort', cancel, { once: true });
			try {
				await animation.finished;
				if (signal.aborted) throw signal.reason;
			} catch (error) {
				if (signal.aborted) throw signal.reason;
				throw error;
			} finally {
				signal.removeEventListener('abort', cancel);
				animation.cancel();
			}
		}
	});
}
