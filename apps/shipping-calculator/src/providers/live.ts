import type { Charge, ExtraService, ProviderId, RateProvider, RateQuote, RateRequest } from "../types.js";

type Json = Record<string, any>;
type Token = { value: string; expiresAt: number };
const tokens = new Map<string, Token>();

export function createUspsProvider(env: NodeJS.ProcessEnv): RateProvider {
  return provider("usps", "USPS", ["parcel", "envelope", "flat"], () => !!env.USPS_CLIENT_ID && !!env.USPS_CLIENT_SECRET, async (request, context) => {
    const token = await oauthJson("usps", "https://apis.usps.com/oauth2/v3/token", env.USPS_CLIENT_ID!, env.USPS_CLIENT_SECRET!, context);
    const response = await requestJson(env.USPS_RATE_URL || "https://apis.usps.com/prices/v3/base-rates-list/search", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({
        originZIPCode: request.originZip,
        destinationZIPCode: request.destinationZip,
        weight: request.weightOunces / 16,
        length: request.dimensions.lengthInches,
        width: request.dimensions.widthInches,
        height: request.dimensions.heightInches,
        mailClass: "ALL",
        processingCategory: request.kind === "envelope" ? "LETTERS" : request.kind === "flat" ? "FLATS" : "MACHINABLE",
        rateIndicator: "SP",
        destinationEntryFacilityType: "NONE",
        priceType: "RETAIL",
        mailingDate: request.shipDate,
        itemValue: request.declaredValueCents === undefined ? undefined : request.declaredValueCents / 100
      }),
      signal: context.signal
    }, context.fetch);
    const options = array(response.rateOptions ?? response.rates ?? response.baseRates);
    return options.flatMap((option: Json, index) => normalizeUsps(option, index, request));
  });
}

export function createUpsProvider(env: NodeJS.ProcessEnv): RateProvider {
  return provider("ups", "UPS", ["parcel"], () => !!env.UPS_CLIENT_ID && !!env.UPS_CLIENT_SECRET && !!env.UPS_ACCOUNT_NUMBER, async (request, context) => {
    const token = await oauthForm("ups", "https://onlinetools.ups.com/security/v1/oauth/token", env.UPS_CLIENT_ID!, env.UPS_CLIENT_SECRET!, context);
    const response = await requestJson(env.UPS_RATE_URL || "https://onlinetools.ups.com/api/rating/v2409/Shop", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ RateRequest: { Request: { TransactionReference: { CustomerContext: "Parcel Lab" } }, Shipment: {
        Shipper: { ShipperNumber: env.UPS_ACCOUNT_NUMBER, Address: { PostalCode: request.originZip, CountryCode: "US" } },
        ShipTo: { Address: { PostalCode: request.destinationZip, CountryCode: "US", ResidentialAddressIndicator: request.residential ? "Y" : undefined } },
        ShipFrom: { Address: { PostalCode: request.originZip, CountryCode: "US" } },
        Package: { PackagingType: { Code: "02" }, Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(request.dimensions.lengthInches), Width: String(request.dimensions.widthInches), Height: String(request.dimensions.heightInches) }, PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(request.weightOunces / 16) } }
      } } }),
      signal: context.signal
    }, context.fetch);
    return array(response.RateResponse?.RatedShipment).map((item: Json, index) => normalizeGeneric("ups", "UPS", item.Service?.Code ?? `service-${index}`, item.Service?.Description ?? `UPS service ${item.Service?.Code ?? index + 1}`, item.TotalCharges?.MonetaryValue, item.GuaranteedDelivery?.BusinessDaysInTransit, request, true, array(item.ItemizedCharges)));
  });
}

export function createFedexProvider(env: NodeJS.ProcessEnv): RateProvider {
  return provider("fedex", "FedEx", ["parcel"], () => !!env.FEDEX_CLIENT_ID && !!env.FEDEX_CLIENT_SECRET && !!env.FEDEX_ACCOUNT_NUMBER, async (request, context) => {
    const token = await oauthFedex("fedex", "https://apis.fedex.com/oauth/token", env.FEDEX_CLIENT_ID!, env.FEDEX_CLIENT_SECRET!, context);
    const response = await requestJson(env.FEDEX_RATE_URL || "https://apis.fedex.com/rate/v1/rates/quotes", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ accountNumber: { value: env.FEDEX_ACCOUNT_NUMBER }, rateRequestControlParameters: { returnTransitTimes: true }, requestedShipment: {
        shipper: { address: { postalCode: request.originZip, countryCode: "US" } },
        recipient: { address: { postalCode: request.destinationZip, countryCode: "US", residential: request.residential } },
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        rateRequestType: ["LIST"],
        shipDateStamp: request.shipDate,
        requestedPackageLineItems: [{ weight: { units: "LB", value: Math.round(request.weightOunces / 16 * 100) / 100 }, dimensions: { units: "IN", length: Math.ceil(request.dimensions.lengthInches), width: Math.ceil(request.dimensions.widthInches), height: Math.ceil(request.dimensions.heightInches) }, declaredValue: request.declaredValueCents === undefined ? undefined : { currency: "USD", amount: request.declaredValueCents / 100 } }]
      } }),
      signal: context.signal
    }, context.fetch);
    return array(response.output?.rateReplyDetails).map((item: Json, index) => {
      const detail = array(item.ratedShipmentDetails)[0] ?? {};
      return normalizeGeneric("fedex", "FedEx", item.serviceType ?? `service-${index}`, item.serviceName ?? item.serviceType ?? "FedEx service", detail.totalNetCharge ?? detail.totalNetFedExCharge, item.commit?.transitDays?.minimumTransitTime ?? item.operationalDetail?.transitTime, request, true, array(detail.surcharges));
    });
  });
}

export function createDhlProvider(env: NodeJS.ProcessEnv): RateProvider {
  return provider("dhl", "DHL Express", ["parcel"], () => !!env.DHL_API_KEY && !!env.DHL_API_SECRET && !!env.DHL_ACCOUNT_NUMBER, async (request, context) => {
    const url = new URL(env.DHL_RATE_URL || "https://express.api.dhl.com/mydhlapi/rates");
    const params = {
      accountNumber: env.DHL_ACCOUNT_NUMBER!, originCountryCode: "US", originPostalCode: request.originZip,
      destinationCountryCode: "US", destinationPostalCode: request.destinationZip,
      weight: String(request.weightOunces / 16), length: String(request.dimensions.lengthInches), width: String(request.dimensions.widthInches), height: String(request.dimensions.heightInches),
      plannedShippingDate: request.shipDate, isCustomsDeclarable: "false", unitOfMeasurement: "imperial"
    };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await requestJson(url.toString(), { method: "GET", headers: { authorization: `Basic ${Buffer.from(`${env.DHL_API_KEY}:${env.DHL_API_SECRET}`).toString("base64")}` }, signal: context.signal }, context.fetch);
    return array(response.products).map((item: Json, index) => normalizeGeneric("dhl", "DHL Express", item.productCode ?? `service-${index}`, item.productName ?? "DHL Express", item.totalPrice?.[0]?.price ?? item.totalPrice, item.deliveryCapabilities?.totalTransitDays, request, true, array(item.detailedPriceBreakdown)));
  });
}

function provider(id: ProviderId, name: string, capabilities: RateProvider["capabilities"], configured: () => boolean, quote: RateProvider["quote"]): RateProvider {
  return { id, name, capabilities, configured, quote };
}

function normalizeUsps(option: Json, index: number, request: RateRequest): RateQuote[] {
  const rate = array(option.rates)[0] ?? option;
  const price = rate.totalBasePrice ?? rate.price ?? option.totalBasePrice ?? option.totalPrice;
  if (price === undefined) return [];
  const extras = array(option.extraServices ?? rate.extraServices);
  return [normalizeGeneric("usps", "USPS", rate.mailClass ?? rate.SKU ?? `service-${index}`, rate.description ?? rate.productName ?? rate.mailClass ?? "USPS service", price, undefined, request, false, extras, false)];
}

function normalizeGeneric(providerId: ProviderId, providerName: string, serviceCode: string, serviceName: string, rawPrice: unknown, rawDays: unknown, request: RateRequest, accountRate: boolean, rawCharges: Json[], priceIncludesCharges = true): RateQuote {
  const carrierTotalCents = cents(rawPrice);
  const features: ExtraService[] = [
    feature("tracking", "Tracking", request.services.tracking, providerId === "usps" ? "included" : "included", 0),
    feature(request.services.signature === "adult" ? "adult-signature" : "signature", request.services.signature === "adult" ? "Adult signature" : "Signature", request.services.signature !== "none", request.services.signature === "none" ? "available" : "available", findCharge(rawCharges, "signature")),
    feature("insurance", "Insurance", request.services.insurance, request.declaredValueCents ? "available" : "unavailable", findCharge(rawCharges, "insurance"), request.declaredValueCents)
  ];
  const selectedCharges: Charge[] = rawCharges.map((charge, index) => ({
    code: String(charge.code ?? charge.type ?? `charge-${index}`),
    name: String(charge.description ?? charge.name ?? charge.type ?? "Carrier charge"),
    amountCents: cents(charge.amount ?? charge.price ?? charge.monetaryValue ?? 0),
    kind: /signature|insurance|tracking/i.test(String(charge.description ?? charge.name ?? charge.type)) ? "extra-service" : "surcharge"
  }));
  const serviceCharges = features.filter(item => item.selected && item.availability === "available" && item.priceCents > 0);
  const includedBreakdownCents = priceIncludesCharges ? selectedCharges.reduce((sum, charge) => sum + charge.amountCents, 0) : 0;
  const basePriceCents = Math.max(0, carrierTotalCents - includedBreakdownCents);
  const charges: Charge[] = [{ code: "postage", name: "Transportation", amountCents: basePriceCents, kind: "postage" }, ...(priceIncludesCharges ? selectedCharges : [])];
  if (!priceIncludesCharges) for (const item of serviceCharges) if (!charges.some(charge => charge.code.includes(item.code))) charges.push({ code: item.code, name: item.name, amountCents: item.priceCents, kind: "extra-service" });
  const compatible = features.every(item => !item.selected || item.availability !== "unavailable");
  return {
    version: 1,
    id: `${providerId}:${serviceCode}`,
    providerId, providerName, serviceCode, serviceName, currency: "USD", basePriceCents,
    totalPriceCents: charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    delivery: { minimumDays: days(rawDays), maximumDays: days(rawDays), guaranteed: false },
    charges, features, compatible,
    warnings: compatible ? [] : ["This service does not satisfy every selected option."],
    source: "live", accountRate
  };
}

function feature(code: string, name: string, selected: boolean, availability: ExtraService["availability"], priceCents: number, coverageCents?: number): ExtraService {
  return { code, name, selected, availability, priceCents, coverageCents };
}
function array(value: unknown): Json[] { return Array.isArray(value) ? value as Json[] : value && typeof value === "object" ? [value as Json] : []; }
function cents(value: unknown): number { const result = Number(typeof value === "object" && value ? (value as Json).amount : value); return Number.isFinite(result) ? Math.round(result * 100) : 0; }
function days(value: unknown): number | undefined { const match = String(value ?? "").match(/\d+/); return match ? Number(match[0]) : undefined; }
function findCharge(charges: Json[], term: string): number { const found = charges.find(item => String(item.name ?? item.description ?? item.type).toLowerCase().includes(term)); return found ? cents(found.amount ?? found.price ?? found.monetaryValue) : 0; }
function bearer(token: string): Record<string, string> { return { authorization: `Bearer ${token}`, "content-type": "application/json" }; }

async function oauthJson(key: string, url: string, clientId: string, clientSecret: string, context: { signal: AbortSignal; fetch: typeof fetch }): Promise<string> {
  return token(key, async () => requestJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: context.signal }, context.fetch));
}
async function oauthForm(key: string, url: string, clientId: string, clientSecret: string, context: { signal: AbortSignal; fetch: typeof fetch }): Promise<string> {
  return token(key, async () => requestJson(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }, body: "grant_type=client_credentials", signal: context.signal }, context.fetch));
}
async function oauthFedex(key: string, url: string, clientId: string, clientSecret: string, context: { signal: AbortSignal; fetch: typeof fetch }): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  return token(key, async () => requestJson(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: context.signal }, context.fetch));
}
async function token(key: string, load: () => Promise<Json>): Promise<string> {
  const existing = tokens.get(key);
  if (existing && existing.expiresAt > Date.now() + 30_000) return existing.value;
  const body = await load();
  const value = String(body.access_token ?? body.accessToken ?? "");
  if (!value) throw new ProviderHttpError(401, "Carrier authentication failed");
  tokens.set(key, { value, expiresAt: Date.now() + Number(body.expires_in ?? body.expiresIn ?? 3_600) * 1000 });
  return value;
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterSeconds?: number) { super(message); }
}

async function requestJson(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Json> {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new ProviderHttpError(response.status, `Carrier returned HTTP ${response.status}`, Number(response.headers.get("retry-after")) || undefined);
  return await response.json() as Json;
}
