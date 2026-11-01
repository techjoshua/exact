/** Checks ordinary gesture observations and retained definition validation. */
export function verifyGestureValues(api: {
	defineGesture: typeof import('../../../component-libraries/gestures/src/definitions.js').defineGesture;
	defineDrag: typeof import('../../../component-libraries/gestures/src/definitions.js').defineDrag;
	createPointerGestureSample: typeof import('../../../component-libraries/gestures/src/gesture-samples.js').createPointerGestureSample;
	createIdleGestureSample: typeof import('../../../component-libraries/gestures/src/gesture-samples.js').createIdleGestureSample;
	resolveKeyboardGestureIntent: typeof import('../../../component-libraries/gestures/src/keyboard-intent.js').resolveKeyboardGestureIntent;
	defaultGestureSettings: typeof import('../../../component-libraries/gestures/src/context.js').defaultGestureSettings;
}): true;

/** Checks clock lease disposal and live pointer, pinch, hover and keyboard session ownership. */
export function verifyGestureSessionOwnership(api: {
	GestureSession: typeof import('../../../component-libraries/gestures/src/session.js').GestureSession;
	defineGesture: typeof import('../../../component-libraries/gestures/src/definitions.js').defineGesture;
	installGestureClock: typeof import('../../../component-libraries/gestures/src/session.js').installGestureClock;
	defaultGestureSettings: typeof import('../../../component-libraries/gestures/src/context.js').defaultGestureSettings;
}): Promise<true>;
