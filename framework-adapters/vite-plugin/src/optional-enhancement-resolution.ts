/** Distinguishes an absent requested provider from broken exports or a missing nested dependency. */
export function isMissingOptionalEnhancement(error: unknown, request: string): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as Error & { code?: string }).code;
	return (
		(code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
		["'", '"'].some((quote) =>
			['Cannot find module ', 'Cannot find package ', 'Could not resolve '].some((prefix) =>
				error.message.includes(`${prefix}${quote}${request}${quote}`)
			)
		)
	);
}
