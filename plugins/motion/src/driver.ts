import type { MotionDriver, MotionEffect } from './contracts.js';

const noMotionDriver: MotionDriver = Object.freeze({
	async play(_element: Element, _effect: MotionEffect, signal: AbortSignal) {
		if (signal.aborted) throw signal.reason;
	}
});

const driverInstallations: Array<{ driver: MotionDriver; active: boolean }> = [];

/** Returns the environment driver currently installed for motion playback. */
export function motionDriver(): MotionDriver {
	for (let index = driverInstallations.length - 1; index >= 0; index--) {
		const installation = driverInstallations[index]!;
		if (installation.active) return installation.driver;
	}
	return noMotionDriver;
}

/** Installs an environment driver and returns a function that restores the previous driver. */
export function installMotionDriver(driver: MotionDriver): () => void {
	if (!driver || typeof driver.play !== 'function')
		throw new TypeError('A motion driver must implement play()');
	const installation = { driver, active: true };
	driverInstallations.push(installation);
	return () => {
		if (!installation.active) return;
		installation.active = false;
		while (driverInstallations.at(-1)?.active === false) driverInstallations.pop();
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
