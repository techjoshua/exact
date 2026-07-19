/** Defines the provider id type contract. */
export type ProviderId = 'doop' | 'usps' | 'ups' | 'fedex' | 'dhl';
/** Defines the mailpiece kind type contract. */
export type MailpieceKind = 'parcel' | 'envelope' | 'flat';
/** Defines the signature level type contract. */
export type SignatureLevel = 'none' | 'standard' | 'adult';
/** Defines the quote sort type contract. */
export type QuoteSort = 'recommended' | 'cheapest' | 'fastest' | 'carrier';

/** Defines the shipment draft type contract. */
export type ShipmentDraft = {
	version: 1;
	originZip: string;
	destinationZip: string;
	kind: MailpieceKind;
	preset:
		| 'custom'
		| 'mailer'
		| 'small-box'
		| 'medium-box'
		| 'large-box'
		| 'letter'
		| 'large-envelope';
	pounds: string;
	ounces: string;
	length: string;
	width: string;
	height: string;
	declaredValue: string;
	tracking: boolean;
	signature: SignatureLevel;
	insurance: boolean;
	residential: boolean;
	machinable: boolean;
	shipDate: string;
};

/** Defines the rate request type contract. */
export type RateRequest = {
	version: 1;
	originZip: string;
	destinationZip: string;
	originZip5: string;
	destinationZip5: string;
	kind: MailpieceKind;
	weightOunces: number;
	dimensions: { lengthInches: number; widthInches: number; heightInches: number };
	declaredValueCents?: number;
	services: { tracking: boolean; signature: SignatureLevel; insurance: boolean };
	residential: boolean;
	machinable: boolean;
	shipDate: string;
};

/** Defines the charge type contract. */
export type Charge = {
	code: string;
	name: string;
	amountCents: number;
	kind: 'postage' | 'surcharge' | 'extra-service' | 'tax';
};

/** Defines the extra service type contract. */
export type ExtraService = {
	code: 'tracking' | 'signature' | 'adult-signature' | 'insurance' | string;
	name: string;
	availability: 'included' | 'available' | 'unavailable';
	priceCents: number;
	selected: boolean;
	coverageCents?: number;
	explanation?: string;
};

/** Defines the rate quote type contract. */
export type RateQuote = {
	version: 1;
	id: string;
	providerId: ProviderId;
	providerName: string;
	serviceCode: string;
	serviceName: string;
	currency: 'USD';
	basePriceCents: number;
	totalPriceCents: number;
	delivery: {
		minimumDays?: number;
		maximumDays?: number;
		estimatedDate?: string;
		guaranteed: boolean;
	};
	charges: Charge[];
	features: ExtraService[];
	compatible: boolean;
	warnings: string[];
	source: 'live' | 'mock';
	accountRate?: boolean;
};

/** Represents a failure raised by public provider. */
export type PublicProviderError = {
	code:
		| 'not_configured'
		| 'invalid_request'
		| 'unauthorized'
		| 'rate_limited'
		| 'unavailable'
		| 'timeout';
	message: string;
	retryAfterSeconds?: number;
};

/** Describes the result produced by provider. */
export type ProviderResult = {
	version: 1;
	providerId: ProviderId;
	providerName: string;
	status: 'success' | 'error' | 'not_configured';
	quotes: RateQuote[];
	error?: PublicProviderError;
};

/** Defines the geo point type contract. */
export type GeoPoint = { zip: string; latitude: number; longitude: number };
/** Describes the result produced by route. */
export type RouteResult = {
	status: 'success' | 'partial' | 'unavailable';
	origin?: GeoPoint;
	destination?: GeoPoint;
	distanceMiles?: number;
};

/** Defines the initial model type contract. */
export type InitialModel = {
	version: 1;
	draft: ShipmentDraft;
	request: RateRequest;
	explicitUrlState: boolean;
	configuredProviders: ProviderId[];
	route: RouteResult;
	providers: ProviderResult[];
};

/** Carries the context required by rate provider. */
export type RateProviderContext = { signal: AbortSignal; fetch: typeof globalThis.fetch };
/** Defines the rate provider interface contract. */
export interface RateProvider {
	readonly id: ProviderId;
	readonly name: string;
	readonly capabilities: readonly ('parcel' | 'envelope' | 'flat')[];
	configured(): boolean;
	quote(request: RateRequest, context: RateProviderContext): Promise<RateQuote[]>;
}
