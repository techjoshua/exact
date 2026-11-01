import { expect, it } from 'vitest';
import { validateIntlPackageMetadata } from './package-metadata.js';

it('captures independent package metadata with ordinary readonly observations', () => {
	const input = {
		protocol: 1,
		sourceLocale: 'en-us',
		messages: './messages',
		sourceUnits: { 'length/road': 'mile' },
		catalogs: { fr: './fr' }
	};
	const observation = validateIntlPackageMetadata(input);
	const writable: { sourceLocale: string } = observation;
	writable.sourceLocale = 'fr';
	const units: Record<string, string> = observation.sourceUnits!;
	units['length/road'] = 'meter';
	const catalogs: Record<string, string> = observation.catalogs!;
	catalogs.fr = './other';
	expect(input.sourceUnits['length/road']).toBe('mile');
	expect(input.catalogs.fr).toBe('./fr');
	expect(validateIntlPackageMetadata(input).sourceLocale).toBe('en-US');
	if (false) {
		// @ts-expect-error Metadata retains ordinary TypeScript readonly fields.
		observation.sourceLocale = 'fr';
	}
});
