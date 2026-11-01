/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import {
	verifyGestureSessionOwnership,
	verifyGestureValues
} from '../../../packages/component-composition-corpus/test-support/gesture-ownership-journey.mjs';
import { GestureSession, installGestureClock } from './session.js';
import { defaultGestureSettings } from './context.js';
import { defineGesture, defineDrag } from './definitions.js';
import { createPointerGestureSample, createIdleGestureSample } from './gesture-samples.js';
import { resolveKeyboardGestureIntent } from './keyboard-intent.js';

it('preserves sample values, validation and ordinary TypeScript aliases', () => {
	expect(
		verifyGestureValues({
			defineGesture,
			defineDrag,
			createPointerGestureSample,
			createIdleGestureSample,
			resolveKeyboardGestureIntent,
			defaultGestureSettings
		})
	).toBe(true);
});

it('releases clock installations and preserves live geometry under callback observation changes', async () => {
	expect(
		await verifyGestureSessionOwnership({
			GestureSession,
			defineGesture,
			installGestureClock,
			defaultGestureSettings
		})
	).toBe(true);
});
