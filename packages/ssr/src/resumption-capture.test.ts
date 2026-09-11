import { describe, expect, it, vi } from 'vitest';
import { createSsrResumptionCapture } from './resumption.js';

describe('SSR resumption capture construction', () => {
	it('does not invoke published root accessors', () => {
		const read = vi.fn(() => 'input');
		const published = Object.defineProperty({}, 'value', { enumerable: true, get: read });
		const capture = createSsrResumptionCapture({}, published, 'root');
		const contract = {
			resumption: { statePaths: ['value'], stateInputs: [['value', 'value']], contexts: [] },
			continuations: []
		} as never;
		const boundary = capture.options.resumptionCapture!;
		const token = boundary.reserveDirect('root', contract)!;
		boundary.publishDirect(token, {}, { value: 'input' }, { value: 'input' });
		expect(read).not.toHaveBeenCalled();
		expect(capture.serializedRecords()).toEqual([['root', [[0, 'input']]]]);
	});
	it('preserves application lifecycle observers', () => {
		const onComponentCreated = vi.fn();
		const onComponentAttemptCheckpoint = vi.fn(() => 'authored');
		const options = { onComponentCreated, onComponentAttemptCheckpoint };

		const direct = createSsrResumptionCapture(options);

		expect(direct.options.onComponentCreated).toBe(onComponentCreated);
		expect(direct.options.onComponentAttemptCheckpoint).toBe(onComponentAttemptCheckpoint);
	});

	it('uses one published-root verification token and restores the claim after rollback', () => {
		const capture = createSsrResumptionCapture({}, { value: 'input' }, 'root');
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
		const capture = createSsrResumptionCapture({});
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

	it('omits compiler-proven primitive defaults but captures divergent finalized state', () => {
		const capture = createSsrResumptionCapture({});
		const contract = {
			resumption: {
				statePaths: ['status', 'count'],
				stateInputs: [],
				stateDefaults: [
					['status', 'idle'],
					['count', 0]
				],
				contexts: []
			},
			continuations: []
		} as never;
		const records = capture.serializedRecords();
		const resumptionCapture = capture.options.resumptionCapture!;

		const matching = resumptionCapture.reserveDirect('component', contract)!;
		resumptionCapture.publishDirect(matching, {}, { status: 'idle', count: 0 }, {});
		const diverged = resumptionCapture.reserveDirect('component', contract)!;
		resumptionCapture.publishDirect(diverged, {}, { status: 'ready', count: 0 }, {});

		expect(records).toEqual([['component'], ['component', [[0, 'ready']]]]);
	});

	it.each([true])(
		'preserves root-read guarantees (direct: %s) and skips nested accessors',
		(direct) => {
			const capture = (direct ? createSsrResumptionCapture : createSsrResumptionCapture)({});
			const contract = {
				resumption: {
					statePaths: ['status', 'profile.name'],
					stateInputs: [],
					contexts: []
				},
				continuations: []
			} as never;
			const rootRead = vi.fn(() => 'ready');
			const nestedRead = vi.fn(() => 'Ada');
			const profile = {} as { name: string };
			Object.defineProperty(profile, 'name', { enumerable: true, get: nestedRead });
			const state = { profile } as { status: string; profile: { name: string } };
			Object.defineProperty(state, 'status', { enumerable: true, get: rootRead });
			const resumptionCapture = capture.options.resumptionCapture!;

			const token = resumptionCapture.reserveDirect('component', contract)!;
			resumptionCapture.publishDirect(token, {}, state, {});

			expect(capture.serializedRecords()).toEqual(
				direct ? [['component', [[0, 'ready']]]] : [['component']]
			);
			expect(rootRead).toHaveBeenCalledTimes(direct ? 1 : 0);
			expect(nestedRead).not.toHaveBeenCalled();
		}
	);
});
