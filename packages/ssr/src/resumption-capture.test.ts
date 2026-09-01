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

	it('uses one published-root verification token and restores the claim after rollback', () => {
		const capture = createDirectSsrResumptionCapture({}, { value: 'input' }, 'root');
		const contract = {
			resumption: {
				statePaths: ['value'],
				stateInputs: [['value', 'value']],
				contexts: []
			},
			continuations: []
		} as never;
		const records = capture.serializedRecords();
		const resumptionCapture = capture.options.resumptionCapture!;

		const root = resumptionCapture.reserveDirect('root', contract)!;
		resumptionCapture.publishDirect(root, {}, { value: 'input' }, { value: 'input' });
		const nested = resumptionCapture.reserveDirect('root', contract)!;
		resumptionCapture.publishDirect(nested, {}, { value: 'input' }, { value: 'input' });
		expect(records).toEqual([['root'], ['root']]);

		resumptionCapture.rollback(0);
		const replacement = resumptionCapture.reserveDirect('root', contract)!;
		resumptionCapture.publishDirect(replacement, {}, { value: 'input' }, { value: 'input' });
		expect(records).toEqual([['root']]);
	});

	it('omits matching nested state inputs but captures values that diverged from their prop', () => {
		const capture = createDirectSsrResumptionCapture({});
		const contract = {
			resumption: {
				statePaths: ['value'],
				stateInputs: [['value', 'value']],
				contexts: []
			},
			continuations: []
		} as never;
		const records = capture.serializedRecords();
		const resumptionCapture = capture.options.resumptionCapture!;

		const matching = resumptionCapture.reserveDirect('nested', contract)!;
		resumptionCapture.publishDirect(matching, {}, { value: 'input' }, { value: 'input' });
		const diverged = resumptionCapture.reserveDirect('nested', contract)!;
		resumptionCapture.publishDirect(diverged, {}, { value: 'changed' }, { value: 'input' });

		expect(records).toEqual([['nested'], ['nested', [[0, 'changed']]]]);
	});
});
