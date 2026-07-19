import type {
	Charge,
	ExtraService,
	ProviderId,
	RateProvider,
	RateQuote,
	RateRequest
} from '../../types.js';

import type { Json } from './contracts.js';

/** Performs the provider domain operation. */
export function provider(
	id: ProviderId,
	name: string,
	capabilities: RateProvider['capabilities'],
	configured: () => boolean,
	quote: RateProvider['quote']
): RateProvider {
	return { id, name, capabilities, configured, quote };
}

/** Transforms usps into its required representation. */
export function normalizeUsps(option: Json, index: number, request: RateRequest): RateQuote[] {
	const rate = array(option.rates)[0] ?? option;
	const price = rate.totalBasePrice ?? rate.price ?? option.totalBasePrice ?? option.totalPrice;
	if (price === undefined) return [];
	const extras = array(option.extraServices ?? rate.extraServices);
	return [
		normalizeGeneric(
			'usps',
			'USPS',
			rate.mailClass ?? rate.SKU ?? `service-${index}`,
			rate.description ?? rate.productName ?? rate.mailClass ?? 'USPS service',
			price,
			undefined,
			request,
			false,
			extras,
			false
		)
	];
}

/** Transforms generic into its required representation. */
export function normalizeGeneric(
	providerId: ProviderId,
	providerName: string,
	serviceCode: string,
	serviceName: string,
	rawPrice: unknown,
	rawDays: unknown,
	request: RateRequest,
	accountRate: boolean,
	rawCharges: Json[],
	priceIncludesCharges = true
): RateQuote {
	const carrierTotalCents = cents(rawPrice);
	const features: ExtraService[] = [
		feature(
			'tracking',
			'Tracking',
			request.services.tracking,
			providerId === 'usps' ? 'included' : 'included',
			0
		),
		feature(
			request.services.signature === 'adult' ? 'adult-signature' : 'signature',
			request.services.signature === 'adult' ? 'Adult signature' : 'Signature',
			request.services.signature !== 'none',
			request.services.signature === 'none' ? 'available' : 'available',
			findCharge(rawCharges, 'signature')
		),
		feature(
			'insurance',
			'Insurance',
			request.services.insurance,
			request.declaredValueCents ? 'available' : 'unavailable',
			findCharge(rawCharges, 'insurance'),
			request.declaredValueCents
		)
	];
	const selectedCharges: Charge[] = rawCharges.map((charge, index) => ({
		code: String(charge.code ?? charge.type ?? `charge-${index}`),
		name: String(charge.description ?? charge.name ?? charge.type ?? 'Carrier charge'),
		amountCents: cents(charge.amount ?? charge.price ?? charge.monetaryValue ?? 0),
		kind: /signature|insurance|tracking/i.test(
			String(charge.description ?? charge.name ?? charge.type)
		)
			? 'extra-service'
			: 'surcharge'
	}));
	const serviceCharges = features.filter(
		(item) => item.selected && item.availability === 'available' && item.priceCents > 0
	);
	const includedBreakdownCents = priceIncludesCharges
		? selectedCharges.reduce((sum, charge) => sum + charge.amountCents, 0)
		: 0;
	const basePriceCents = Math.max(0, carrierTotalCents - includedBreakdownCents);
	const charges: Charge[] = [
		{ code: 'postage', name: 'Transportation', amountCents: basePriceCents, kind: 'postage' },
		...(priceIncludesCharges ? selectedCharges : [])
	];
	if (!priceIncludesCharges)
		for (const item of serviceCharges)
			if (!charges.some((charge) => charge.code.includes(item.code)))
				charges.push({
					code: item.code,
					name: item.name,
					amountCents: item.priceCents,
					kind: 'extra-service'
				});
	const compatible = features.every(
		(item) => !item.selected || item.availability !== 'unavailable'
	);
	return {
		version: 1,
		id: `${providerId}:${serviceCode}`,
		providerId,
		providerName,
		serviceCode,
		serviceName,
		currency: 'USD',
		basePriceCents,
		totalPriceCents: charges.reduce((sum, charge) => sum + charge.amountCents, 0),
		delivery: { minimumDays: days(rawDays), maximumDays: days(rawDays), guaranteed: false },
		charges,
		features,
		compatible,
		warnings: compatible ? [] : ['This service does not satisfy every selected option.'],
		source: 'live',
		accountRate
	};
}

/** Performs the feature domain operation. */
export function feature(
	code: string,
	name: string,
	selected: boolean,
	availability: ExtraService['availability'],
	priceCents: number,
	coverageCents?: number
): ExtraService {
	return { code, name, selected, availability, priceCents, coverageCents };
}
/** Performs the array domain operation. */
export function array(value: unknown): Json[] {
	return Array.isArray(value)
		? (value as Json[])
		: value && typeof value === 'object'
			? [value as Json]
			: [];
}
/** Performs the cents domain operation. */
export function cents(value: unknown): number {
	const result = Number(typeof value === 'object' && value ? (value as Json).amount : value);
	return Number.isFinite(result) ? Math.round(result * 100) : 0;
}
/** Performs the days domain operation. */
export function days(value: unknown): number | undefined {
	const match = String(value ?? '').match(/\d+/);
	return match ? Number(match[0]) : undefined;
}
/** Resolves a charge. */
export function findCharge(charges: Json[], term: string): number {
	const found = charges.find((item) =>
		String(item.name ?? item.description ?? item.type)
			.toLowerCase()
			.includes(term)
	);
	return found ? cents(found.amount ?? found.price ?? found.monetaryValue) : 0;
}
