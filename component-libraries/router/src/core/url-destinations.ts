const absoluteDestinationPattern = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Identifies schemes, network references and URL objects that resolve outside a router basename. */
export function isAbsoluteDestination(value: string | URL): boolean {
	return value instanceof URL || absoluteDestinationPattern.test(value);
}
