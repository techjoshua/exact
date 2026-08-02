import { describe, expect, it, vi } from 'vitest';
import type { MotionSettings } from './contracts.js';
import { resolveMotionEffect } from './playback.js';

const element = {} as Element;
const settings = (reducedMotion: MotionSettings['reducedMotion']): MotionSettings => ({
	enabled: true,
	reducedMotion,
	transition: {},
	appear: false
});

describe('motion effect resolution', () => {
	it('completes immediately under reduced motion when no reduced phase is supplied', () => {
		expect(
			resolveMotionEffect(
				{ keyframes: [{ opacity: 0 }, { opacity: 1 }] },
				element,
				'enter',
				settings('always')
			)
		).toBeUndefined();
	});

	it('uses an explicit reduced phase with reduced context', () => {
		const reduced = vi.fn(() => ({ keyframes: [{ opacity: 1 }] }));
		const effect = resolveMotionEffect(
			{ keyframes: [{ transform: 'translateX(100px)' }] },
			element,
			'change',
			settings('always'),
			reduced
		);
		expect(reduced).toHaveBeenCalledWith({ phase: 'change', element, reducedMotion: true });
		expect(effect?.keyframes).toEqual([{ opacity: 1 }]);
	});

	it('rejects non-finite timing returned by a dynamic phase', () => {
		expect(() =>
			resolveMotionEffect(
				() => ({ keyframes: [{ opacity: 0 }], options: { delay: Infinity } }),
				element,
				'leave',
				settings('never')
			)
		).toThrow('delay must be finite');
	});
});
