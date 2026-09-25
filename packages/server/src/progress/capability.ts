import { logFrameworkEvent } from '@exactjs/core';
import type { ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';
import type { ExactServerContext } from '../types.js';

const warned = new WeakMap<ExactComponentContinuationContract, Set<string>>();

/**
 * Warns once per contract and disabled capability reason, including newly loaded components.
 * This boundary runs only for an invoked continuation, never for ordinary SSR execution.
 */
export function warnUnavailableTaskProgress(
	contract: ExactComponentContinuationContract,
	context: ExactServerContext
): void {
	if (!contract.progress?.length || context.reportTaskProgress) return;
	const reason =
		context.progress?.reason ??
		(context.progress?.supported === false
			? 'deployment configuration disables streaming progress'
			: 'the request did not enable streaming progress');
	let reasons = warned.get(contract);
	if (!reasons) warned.set(contract, (reasons = new Set()));
	if (reasons.has(reason)) return;
	reasons.add(reason);
	logFrameworkEvent(
		'warn',
		'server',
		'task',
		`Live task progress is disabled: ${reason}. Affected receivers: ${contract.progress.map((receiver) => receiver.label).join(', ')}. The server task still runs once and returns its final result or error; progress handlers will not run.`,
		undefined,
		context.logger
	);
}
