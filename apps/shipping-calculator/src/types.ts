export type ProviderId = 'doop' | 'usps' | 'ups' | 'fedex' | 'dhl';
export type MailpieceKind = 'parcel' | 'envelope' | 'flat';
export type SignatureLevel = 'none' | 'standard' | 'adult';
export type QuoteSort = 'recommended' | 'cheapest' | 'fastest' | 'carrier';

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

export type Charge = {
	code: string;
	name: string;
	amountCents: number;
	kind: 'postage' | 'surcharge' | 'extra-service' | 'tax';
};

export type ExtraService = {
	code: 'tracking' | 'signature' | 'adult-signature' | 'insurance' | string;
	name: string;
	availability: 'included' | 'available' | 'unavailable';
	priceCents: number;
	selected: boolean;
	coverageCents?: number;
	explanation?: string;
};

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

export type ProviderResult = {
	version: 1;
	providerId: ProviderId;
	providerName: string;
	status: 'success' | 'error' | 'not_configured';
	quotes: RateQuote[];
	error?: PublicProviderError;
};

export type GeoPoint = { zip: string; latitude: number; longitude: number };
export type RouteResult = {
	status: 'success' | 'partial' | 'unavailable';
	origin?: GeoPoint;
	destination?: GeoPoint;
	distanceMiles?: number;
};

export type InitialModel = {
	version: 1;
	draft: ShipmentDraft;
	request: RateRequest;
	explicitUrlState: boolean;
	configuredProviders: ProviderId[];
	route: RouteResult;
	providers: ProviderResult[];
};

export type RateProviderContext = { signal: AbortSignal; fetch: typeof globalThis.fetch };
export interface RateProvider {
	readonly id: ProviderId;
	readonly name: string;
	readonly capabilities: readonly ('parcel' | 'envelope' | 'flat')[];
	configured(): boolean;
	quote(request: RateRequest, context: RateProviderContext): Promise<RateQuote[]>;
}
