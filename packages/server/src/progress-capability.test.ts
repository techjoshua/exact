import { expect, it, vi } from 'vitest';
import { warnUnavailableTaskProgress } from './progress/capability.js';
import type { ExactServerContext } from './types.js';
import type { ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';

function contract(label: string): ExactComponentContinuationContract {
	return {
		id: label,
		kind: 'task',
		componentId: label,
		readiness: 'blocking',
		dependencies: [],
		stateReads: [],
		stateWrites: [],
		publicContexts: [],
		serverContexts: [],
		contextWrites: [],
		boundaries: [],
		progress: [{ id: 'receiver', label }]
	};
}

it('deduplicates unsupported warnings without hiding additional or lazily loaded components', () => {
	const logger = { log: vi.fn() };
	const context: ExactServerContext = {
		contract: { version: 1, invocations: {}, boundaries: {} },
		logger,
		progress: { supported: false, reason: 'generic serverless adapter buffers responses' }
	};
	const first = contract('First.report');
	const second = contract('@example/library/Lazy.report');
	warnUnavailableTaskProgress(first, context);
	warnUnavailableTaskProgress(first, context);
	warnUnavailableTaskProgress(second, context);
	warnUnavailableTaskProgress(second, context);
	expect(logger.log).toHaveBeenCalledTimes(2);
	expect(logger.log.mock.calls[0]![0].message).toContain('First.report');
	expect(logger.log.mock.calls[1]![0].message).toContain('@example/library/Lazy.report');
	warnUnavailableTaskProgress(first, { ...context, reportTaskProgress() {} });
	expect(logger.log).toHaveBeenCalledTimes(2);
});
