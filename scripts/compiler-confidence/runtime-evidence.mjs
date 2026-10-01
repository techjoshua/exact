import { runtimeWitnesses } from './environment-witnesses.mjs';

/** Requires this invocation's completed host matrix rather than accepting a retained report. */
export function verifyRuntimeExecution(report, { runToken, started }) {
	if (
		!runToken ||
		!Number.isFinite(Date.parse(started)) ||
		report.version !== 1 ||
		report.success !== true ||
		report.runToken !== runToken ||
		!['chromium', 'firefox', 'webkit'].includes(report.browser) ||
		!Number.isFinite(Date.parse(report.started)) ||
		Date.parse(report.started) < Date.parse(started) ||
		!Number.isFinite(Date.parse(report.finished)) ||
		Date.parse(report.finished) < Date.parse(report.started) ||
		!Array.isArray(report.executions) ||
		report.executions.length !== runtimeWitnesses.length
	)
		throw new Error('Missing, stale or unsuccessful native runtime evidence');
	return runtimeWitnesses.map((witness) => {
		const matches = report.executions.filter((entry) => entry.id === witness.id);
		if (
			matches.length !== 1 ||
			matches[0].status !== 'verified' ||
			!Array.isArray(matches[0].tests) ||
			matches[0].tests.length !== witness.tests.length ||
			witness.tests.some((name) => matches[0].tests.filter((test) => test === name).length !== 1)
		)
			throw new Error(witness.id + ': missing native runtime checks');
		return {
			...witness,
			environment: witness.environment + ' (' + report.browser + ')',
			status: 'verified'
		};
	});
}
