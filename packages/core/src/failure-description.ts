/** Describes a reason without letting conversion failures replace its failure or cancellation. */
export function describeFailureReason(reason: unknown, fallback: string): string {
	try {
		return reason === undefined ? fallback : String(reason);
	} catch {
		return fallback;
	}
}
