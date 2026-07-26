import { format } from 'node:util';

/** Captures scenario diagnostics and rejects output that was not explicitly anticipated. */
export function captureExpectedConsole(label, allowed = [], required = []) {
	const originalError = console.error;
	const originalWarn = console.warn;
	const observed = [];
	const capture = (...args) => observed.push(format(...args));
	console.error = capture;
	console.warn = capture;
	return {
		restoreAndAssert() {
			console.error = originalError;
			console.warn = originalWarn;
			const unexpected = observed.filter(
				(message) => !allowed.some((pattern) => pattern.test(message))
			);
			if (unexpected.length) {
				throw new Error(`${label} emitted unexpected diagnostics:\n${unexpected.join('\n---\n')}`);
			}
			for (const pattern of required) {
				if (!observed.some((message) => pattern.test(message)))
					throw new Error(`${label} no longer emitted expected diagnostic ${pattern}`);
			}
		}
	};
}
