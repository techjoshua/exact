import { describe, expect, it } from 'vitest';
import {
	checkpointEnhancementFallback,
	claimEnhancementFallback,
	enhancementFallbackAvailable,
	fallbackEnhancementEntries,
	forwardEnhancementFallback
} from './enhancement-fallback.js';

describe('prepared enhancement fallback ownership', () => {
	it('restores a delegated claim for retry without affecting an independent namespace', () => {
		const [first, second] = fallbackEnhancementEntries({ identity: 'motion', props: {} }, 2);
		const [independent] = fallbackEnhancementEntries({ identity: 'a11y', props: {} }, 1);
		const normalized = { ...first! };
		forwardEnhancementFallback(first!, normalized);
		const restore = checkpointEnhancementFallback([normalized]);
		claimEnhancementFallback(normalized);
		claimEnhancementFallback(independent!);
		expect(enhancementFallbackAvailable(second!)).toBe(false);
		restore();
		expect(enhancementFallbackAvailable(first!)).toBe(true);
		expect(enhancementFallbackAvailable(second!)).toBe(true);
		expect(enhancementFallbackAvailable(independent!)).toBe(false);
	});

	it('removes delegation from a resolved target so rendering it does not reclaim siblings', () => {
		const [candidate] = fallbackEnhancementEntries({ identity: 'motion', props: {} }, 1);
		const selected = claimEnhancementFallback(candidate!);
		expect(enhancementFallbackAvailable(candidate!)).toBe(false);
		expect(enhancementFallbackAvailable(selected)).toBe(true);
	});
});
