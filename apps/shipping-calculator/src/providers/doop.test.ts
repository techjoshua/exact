import { describe, expect, it } from 'vitest';
import { defaultDraft, normalizeDraft } from '../model.js';
import { doopProvider } from './doop.js';

const signal = new AbortController().signal;
const context = { signal, fetch: globalThis.fetch };

describe('DOOP reference rates', () => {
	it('is deterministic and exposes all long-distance service levels except Today', async () => {
		const request = normalizeDraft(defaultDraft);
		const first = await doopProvider.quote(request, context);
		const second = await doopProvider.quote(request, context);
		expect(second).toEqual(first);
		expect(first.map((quote) => quote.serviceCode)).toEqual(['SCOOT', 'STANDARD', 'ZOOM']);
	});

	it('offers Today in the nearest zone', async () => {
		const request = normalizeDraft({ ...defaultDraft, destinationZip: '97209' });
		const quotes = await doopProvider.quote(request, context);
		expect(quotes.map((quote) => quote.serviceCode)).toContain('TODAY');
	});

	it('prices paid tracking on Scoot and included tracking on Standard', async () => {
		const quotes = await doopProvider.quote(normalizeDraft(defaultDraft), context);
		const scoot = quotes.find((quote) => quote.serviceCode === 'SCOOT')!;
		const standard = quotes.find((quote) => quote.serviceCode === 'STANDARD')!;
		expect(scoot.features.find((feature) => feature.code === 'tracking')?.availability).toBe(
			'available'
		);
		expect(scoot.charges.find((charge) => charge.code === 'tracking')?.amountCents).toBe(79);
		expect(standard.features.find((feature) => feature.code === 'tracking')?.availability).toBe(
			'included'
		);
	});

	it('uses dimensional weight and adds oversize, signature, and insurance charges', async () => {
		const request = normalizeDraft({
			...defaultDraft,
			length: '70',
			width: '24',
			height: '24',
			declaredValue: '500',
			insurance: true,
			signature: 'adult'
		});
		const [scoot] = await doopProvider.quote(request, context);
		expect(scoot.warnings).toContain('Dimensional weight is greater than actual weight.');
		expect(scoot.charges.map((charge) => charge.code)).toEqual(
			expect.arrayContaining(['oversize', 'insurance'])
		);
		expect(scoot.charges.map((charge) => charge.code)).not.toContain('signature');
		expect(scoot.totalPriceCents).toBe(
			scoot.charges.reduce((sum, charge) => sum + charge.amountCents, 0)
		);
		expect(scoot.compatible).toBe(false);
		expect(scoot.features.find((feature) => feature.code === 'adult-signature')?.availability).toBe(
			'unavailable'
		);
	});
});
