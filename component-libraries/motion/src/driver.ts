import type { MotionDriver, MotionEffect } from './contracts.js';

const defaultMotionDriver = createWebAnimationDriver();

const driverInstallations: Array<{ driver: MotionDriver; active: boolean }> = [];

/** Returns the environment driver currently installed for motion playback. */
export function motionDriver(): MotionDriver {
	for (let index = driverInstallations.length - 1; index >= 0; index--) {
		const installation = driverInstallations[index]!;
		if (installation.active) return installation.driver;
	}
	return defaultMotionDriver;
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
	const interruptedFrames = new WeakMap<Element, Readonly<Record<string, string>>>();
	return Object.freeze({
		async play(element: Element, effect: MotionEffect, signal: AbortSignal): Promise<void> {
			if (signal.aborted) throw signal.reason;
			if (typeof element.animate !== 'function') return;
			// Enhancement targets can be logically presented while their containing component tree is
			// still being placed. Starting a backwards-filled animation in that provisional state can
			// leave Chromium displaying its first frame after the tree becomes connected. The next paint
			// boundary is the first browser-owned point after synchronous and microtask-driven placement.
			await placementFrame();
			if (signal.aborted) throw signal.reason;
			const interrupted = interruptedFrames.get(element);
			if (interrupted) interruptedFrames.delete(element);
			const keyframes = interrupted
				? continueFromInterruptedFrame(effect.keyframes, interrupted)
				: effect.keyframes;
			const animation = element.animate(keyframes, {
				fill: 'both',
				...effect.options
			});
			const cancel = () => {
				const frame = captureAnimatedFrame(element, effect.keyframes);
				if (frame) interruptedFrames.set(element, frame);
				animation.cancel();
			};
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

function placementFrame(): Promise<void> {
	if (typeof globalThis.requestAnimationFrame !== 'function') return Promise.resolve();
	return new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
}

function captureAnimatedFrame(
	element: Element,
	keyframes: MotionEffect['keyframes']
): Readonly<Record<string, string>> | undefined {
	if (typeof globalThis.getComputedStyle !== 'function') return undefined;
	const properties = animatedProperties(keyframes);
	if (!properties.size) return undefined;
	const computed = globalThis.getComputedStyle(element);
	const frame: Record<string, string> = {};
	for (const property of properties) {
		const value = computed.getPropertyValue(cssPropertyName(property));
		if (value) frame[property] = value;
	}
	return Object.keys(frame).length ? Object.freeze(frame) : undefined;
}

function animatedProperties(keyframes: MotionEffect['keyframes']): Set<string> {
	const properties = new Set<string>();
	const records = Array.isArray(keyframes) ? keyframes : [keyframes];
	for (const frame of records) {
		for (const property of Object.keys(frame)) {
			if (property !== 'offset' && property !== 'easing' && property !== 'composite') {
				properties.add(property);
			}
		}
	}
	return properties;
}

function continueFromInterruptedFrame(
	keyframes: MotionEffect['keyframes'],
	interrupted: Readonly<Record<string, string>>
): MotionEffect['keyframes'] {
	if (Array.isArray(keyframes)) {
		if (keyframes.length <= 1) return [interrupted, ...keyframes];
		return [{ ...keyframes[0], ...interrupted }, ...keyframes.slice(1)];
	}
	const continued: PropertyIndexedKeyframes = { ...keyframes };
	for (const [property, value] of Object.entries(interrupted)) {
		const authored = keyframes[property as keyof PropertyIndexedKeyframes];
		continued[property as keyof PropertyIndexedKeyframes] = Array.isArray(authored)
			? ([value, ...authored.slice(1)] as never)
			: ([value, authored] as never);
	}
	return continued;
}

function cssPropertyName(property: string): string {
	if (property.startsWith('--')) return property;
	return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
