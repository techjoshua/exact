/** Details measured by one response owner, without equating graph content and encoded bytes. */
export type ResponseResourceDetails = {
	option: string;
	scope: string;
	unit: string;
	threshold: number;
	actual: number;
	explicit: boolean;
};

/** Reports the first breach per setting through the owner's existing logger. */
export type ResponseResourceReporter = (
	level: 'warn' | 'error',
	message: string,
	details: ResponseResourceDetails
) => void;

/** Checks an observed quantity, warning by default and throwing for a positive configured cap. */
export type ResponseResourceBudget = (
	option: string,
	configured: number | undefined,
	warningThreshold: number,
	actual: number,
	scope: string,
	unit: string
) => void;

/** Identifies an explicit response-resource failure independently of malformed graph data. */
export class ResponseResourceLimitError extends RangeError {}

/** Owns warning deduplication for one response, stream, relay or operation result. */
export function createResponseResourceBudget(
	report: ResponseResourceReporter
): ResponseResourceBudget {
	const reported = new Set<string>();
	return (option, configured, warningThreshold, actual, scope, unit) => {
		const explicit =
			typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0;
		const threshold = explicit ? configured : warningThreshold;
		if (actual <= threshold) return;
		const details = { option, scope, unit, threshold, actual, explicit };
		const message = `eXact ${scope} resource limit exceeded ${option}: actual ${actual} ${unit}, ${explicit ? 'configured cap' : 'default warning threshold'} ${threshold} ${unit}`;
		if (!reported.has(option)) {
			reported.add(option);
			report(explicit ? 'error' : 'warn', message, details);
		}
		if (explicit) throw new ResponseResourceLimitError(message);
	};
}
