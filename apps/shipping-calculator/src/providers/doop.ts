import { distanceZone, resolveRoute } from '../geography.js';
import type { Charge, ExtraService, RateProvider, RateQuote, RateRequest } from '../types.js';

type DoopService = {
	code: string;
	name: string;
	base: number;
	zone: number;
	pound: number;
	minDays: number;
	maxDays: number;
	tracking: 'included' | 'available';
	signatureIncluded?: boolean;
	includedInsuranceCents: number;
	nearestOnly?: boolean;
};

const services: DoopService[] = [
	{
		code: 'SCOOT',
		name: 'DOOP Scoot',
		base: 400,
		zone: 60,
		pound: 45,
		minDays: 5,
		maxDays: 8,
		tracking: 'available',
		includedInsuranceCents: 0
	},
	{
		code: 'STANDARD',
		name: 'DOOP Standard',
		base: 650,
		zone: 75,
		pound: 65,
		minDays: 3,
		maxDays: 5,
		tracking: 'included',
		includedInsuranceCents: 10_000
	},
	{
		code: 'ZOOM',
		name: 'DOOP Zoom',
		base: 1_350,
		zone: 110,
		pound: 105,
		minDays: 1,
		maxDays: 2,
		tracking: 'included',
		includedInsuranceCents: 10_000
	},
	{
		code: 'TODAY',
		name: 'DOOP Today',
		base: 1_800,
		zone: 0,
		pound: 145,
		minDays: 0,
		maxDays: 1,
		tracking: 'included',
		signatureIncluded: true,
		includedInsuranceCents: 25_000,
		nearestOnly: true
	}
];

/** Provides the canonical doop provider value. */
export const doopProvider: RateProvider = {
	id: 'doop',
	name: 'DOOP',
	capabilities: ['parcel', 'envelope', 'flat'],
	configured: () => true,
	async quote(request, context) {
		if (context.signal.aborted) throw context.signal.reason;
		const route = resolveRoute(request.originZip5, request.destinationZip5);
		const zone = distanceZone(route.distanceMiles);
		const volume =
			request.dimensions.lengthInches *
			request.dimensions.widthInches *
			request.dimensions.heightInches;
		const actualPounds = request.weightOunces / 16;
		const dimensionalPounds = request.kind === 'parcel' ? volume / 139 : 0;
		const billablePounds = Math.max(1, Math.ceil(Math.max(actualPounds, dimensionalPounds)));
		const girth = 2 * (request.dimensions.widthInches + request.dimensions.heightInches);
		const oversize = request.kind === 'parcel' && request.dimensions.lengthInches + girth > 108;
		return services
			.filter((service) => !service.nearestOnly || zone === 1)
			.map((service) =>
				quoteFor(service, request, zone, billablePounds, dimensionalPounds > actualPounds, oversize)
			);
	}
};

function quoteFor(
	service: DoopService,
	request: RateRequest,
	zone: number,
	pounds: number,
	dimensional: boolean,
	oversize: boolean
): RateQuote {
	const postage = service.base + service.zone * zone + service.pound * pounds;
	const charges: Charge[] = [
		{ code: 'base', name: 'Transportation', amountCents: postage, kind: 'postage' }
	];
	if (request.residential)
		charges.push({
			code: 'residential',
			name: 'Residential delivery',
			amountCents: 175,
			kind: 'surcharge'
		});
	if (oversize)
		charges.push({
			code: 'oversize',
			name: 'Extremely roomy parcel',
			amountCents: 1_500,
			kind: 'surcharge'
		});
	if (!request.machinable)
		charges.push({ code: 'manual', name: 'Hand sorting', amountCents: 125, kind: 'surcharge' });

	const features: ExtraService[] = [];
	const trackingSelected = request.services.tracking;
	const trackingPrice = service.tracking === 'available' ? 79 : 0;
	features.push({
		code: 'tracking',
		name: 'Parcel Pings tracking',
		availability: service.tracking,
		priceCents: trackingPrice,
		selected: trackingSelected,
		explanation:
			service.tracking === 'included'
				? 'Included with this DOOP service'
				: 'Adds a scannable tracking number at mailing'
	});
	if (trackingSelected && trackingPrice)
		charges.push({
			code: 'tracking',
			name: 'Parcel Pings tracking',
			amountCents: trackingPrice,
			kind: 'extra-service'
		});

	const signatureSelected = request.services.signature !== 'none';
	const signatureUnavailable = service.code === 'SCOOT' && request.services.signature === 'adult';
	const signaturePrice =
		service.signatureIncluded || signatureUnavailable
			? 0
			: request.services.signature === 'adult'
				? 970
				: 325;
	features.push({
		code: request.services.signature === 'adult' ? 'adult-signature' : 'signature',
		name: request.services.signature === 'adult' ? 'Adult signature' : 'Signature',
		availability: signatureUnavailable
			? 'unavailable'
			: service.signatureIncluded
				? 'included'
				: 'available',
		priceCents: signaturePrice,
		selected: signatureSelected,
		explanation: signatureUnavailable ? 'DOOP Scoot cannot verify an adult recipient' : undefined
	});
	if (signatureSelected && signaturePrice)
		charges.push({
			code: 'signature',
			name: request.services.signature === 'adult' ? 'Adult signature' : 'Signature',
			amountCents: signaturePrice,
			kind: 'extra-service'
		});

	const value = request.declaredValueCents ?? 0;
	const extraCoverage = Math.max(0, value - service.includedInsuranceCents);
	const insurancePrice = extraCoverage ? Math.max(150, Math.ceil(extraCoverage / 10_000) * 90) : 0;
	features.push({
		code: 'insurance',
		name: 'Shipment protection',
		availability:
			service.includedInsuranceCents && value <= service.includedInsuranceCents
				? 'included'
				: 'available',
		priceCents: insurancePrice,
		selected: request.services.insurance,
		coverageCents: request.services.insurance ? value : service.includedInsuranceCents,
		explanation: service.includedInsuranceCents
			? `${money(service.includedInsuranceCents)} coverage included`
			: 'Coverage priced from declared value'
	});
	if (request.services.insurance && insurancePrice)
		charges.push({
			code: 'insurance',
			name: 'Shipment protection',
			amountCents: insurancePrice,
			kind: 'extra-service'
		});

	const compatible = features.every(
		(feature) => !feature.selected || feature.availability !== 'unavailable'
	);
	const warnings = dimensional ? ['Dimensional weight is greater than actual weight.'] : [];
	if (!compatible) warnings.push('Adult signature is unavailable with DOOP Scoot.');
	const totalPriceCents = charges.reduce((total, charge) => total + charge.amountCents, 0);
	return {
		version: 1,
		id: `doop:${service.code}`,
		providerId: 'doop',
		providerName: 'DOOP',
		serviceCode: service.code,
		serviceName: service.name,
		currency: 'USD',
		basePriceCents: postage,
		totalPriceCents,
		delivery: {
			minimumDays: service.minDays,
			maximumDays: service.maxDays,
			guaranteed: service.code === 'TODAY'
		},
		charges,
		features,
		compatible,
		warnings,
		source: 'mock'
	};
}

function money(cents: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
