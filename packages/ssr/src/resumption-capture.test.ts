import { describe, expect, it, vi } from 'vitest';
import { createDirectSsrResumptionCapture, createSsrResumptionCapture } from './resumption.js';

describe('SSR resumption capture construction', () => {
	it('omits the generic instance bridge for compiler-closed artifact roots', () => {
		const onComponentCreated = vi.fn();
		const onComponentAttemptCheckpoint = vi.fn(() => 'authored');
		const options = { onComponentCreated, onComponentAttemptCheckpoint };

		const direct = createDirectSsrResumptionCapture(options);
		const generic = createSsrResumptionCapture(options);

		expect(direct.options.onComponentCreated).toBe(onComponentCreated);
		expect(direct.options.onComponentAttemptCheckpoint).toBe(onComponentAttemptCheckpoint);
		expect(generic.options.onComponentCreated).not.toBe(onComponentCreated);
		expect(generic.options.onComponentAttemptCheckpoint).not.toBe(onComponentAttemptCheckpoint);
	});
});
