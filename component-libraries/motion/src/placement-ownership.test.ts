import { expect, it } from 'vitest';
import {
	verifyMotionPlacement,
	verifyMotionValues
} from '../../../packages/component-composition-corpus/test-support/motion-ownership-journey.mjs';
import { createWebAnimationDriver } from './driver.js';
import { defineMotion } from './definitions.js';
import { animate, resolveMotionEffect } from './playback.js';
import { createViewTransitionCoordinator } from './view-transition.js';
import { defaultMotionSettings } from './context.js';

it('settles owner cancellation without waiting for placement and permits subsequent progress', async () => {
	expect(await verifyMotionPlacement({ createWebAnimationDriver, animate })).toBe(true);
});

it('preserves ordinary motion values and finite Web Animations timing', () => {
	expect(
		verifyMotionValues({
			defineMotion,
			resolveMotionEffect,
			createViewTransitionCoordinator,
			defaultMotionSettings,
			createWebAnimationDriver
		})
	).toBe(true);
});
