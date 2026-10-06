/** Native JavaScript supplies the expected date defaults, independently of framework helpers. */
export function intlProjectionExpected(step, locale = 'en-US') {
	const date = new Date(Date.UTC(2024, 2, 2 + step, 15, 4, 5));
	return [
		date.toLocaleDateString(locale, { hour: 'numeric', timeZone: 'UTC' }),
		date.toLocaleTimeString(locale, { year: 'numeric', timeZone: 'UTC' }),
		'Invalid Date',
		`selected ${step}`,
		...[Number.NaN, Number.POSITIVE_INFINITY, 9007199254740993n + BigInt(step)].map((value) =>
			new Intl.NumberFormat('en-US', { style: 'unit', unit: 'degree' }).format(value)
		)
	].join(' / ');
}
