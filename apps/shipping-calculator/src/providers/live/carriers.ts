import type { RateProvider } from '../../types.js';

import type { Json } from './contracts.js';
import { bearer, oauthFedex, oauthForm, oauthJson, requestJson } from './http.js';
import { array, normalizeGeneric, normalizeUsps, provider } from './normalization.js';

export function createUspsProvider(env: NodeJS.ProcessEnv): RateProvider {
	return provider(
		'usps',
		'USPS',
		['parcel', 'envelope', 'flat'],
		() => !!env.USPS_CLIENT_ID && !!env.USPS_CLIENT_SECRET,
		async (request, context) => {
			const token = await oauthJson(
				'usps',
				'https://apis.usps.com/oauth2/v3/token',
				env.USPS_CLIENT_ID!,
				env.USPS_CLIENT_SECRET!,
				context
			);
			const response = await requestJson(
				env.USPS_RATE_URL || 'https://apis.usps.com/prices/v3/base-rates-list/search',
				{
					method: 'POST',
					headers: bearer(token),
					body: JSON.stringify({
						originZIPCode: request.originZip,
						destinationZIPCode: request.destinationZip,
						weight: request.weightOunces / 16,
						length: request.dimensions.lengthInches,
						width: request.dimensions.widthInches,
						height: request.dimensions.heightInches,
						mailClass: 'ALL',
						processingCategory:
							request.kind === 'envelope'
								? 'LETTERS'
								: request.kind === 'flat'
									? 'FLATS'
									: 'MACHINABLE',
						rateIndicator: 'SP',
						destinationEntryFacilityType: 'NONE',
						priceType: 'RETAIL',
						mailingDate: request.shipDate,
						itemValue:
							request.declaredValueCents === undefined
								? undefined
								: request.declaredValueCents / 100
					}),
					signal: context.signal
				},
				context.fetch
			);
			const options = array(response.rateOptions ?? response.rates ?? response.baseRates);
			return options.flatMap((option: Json, index) => normalizeUsps(option, index, request));
		}
	);
}

export function createUpsProvider(env: NodeJS.ProcessEnv): RateProvider {
	return provider(
		'ups',
		'UPS',
		['parcel'],
		() => !!env.UPS_CLIENT_ID && !!env.UPS_CLIENT_SECRET && !!env.UPS_ACCOUNT_NUMBER,
		async (request, context) => {
			const token = await oauthForm(
				'ups',
				'https://onlinetools.ups.com/security/v1/oauth/token',
				env.UPS_CLIENT_ID!,
				env.UPS_CLIENT_SECRET!,
				context
			);
			const response = await requestJson(
				env.UPS_RATE_URL || 'https://onlinetools.ups.com/api/rating/v2409/Shop',
				{
					method: 'POST',
					headers: bearer(token),
					body: JSON.stringify({
						RateRequest: {
							Request: { TransactionReference: { CustomerContext: 'Parcel Lab' } },
							Shipment: {
								Shipper: {
									ShipperNumber: env.UPS_ACCOUNT_NUMBER,
									Address: { PostalCode: request.originZip, CountryCode: 'US' }
								},
								ShipTo: {
									Address: {
										PostalCode: request.destinationZip,
										CountryCode: 'US',
										ResidentialAddressIndicator: request.residential ? 'Y' : undefined
									}
								},
								ShipFrom: { Address: { PostalCode: request.originZip, CountryCode: 'US' } },
								Package: {
									PackagingType: { Code: '02' },
									Dimensions: {
										UnitOfMeasurement: { Code: 'IN' },
										Length: String(request.dimensions.lengthInches),
										Width: String(request.dimensions.widthInches),
										Height: String(request.dimensions.heightInches)
									},
									PackageWeight: {
										UnitOfMeasurement: { Code: 'LBS' },
										Weight: String(request.weightOunces / 16)
									}
								}
							}
						}
					}),
					signal: context.signal
				},
				context.fetch
			);
			return array(response.RateResponse?.RatedShipment).map((item: Json, index) =>
				normalizeGeneric(
					'ups',
					'UPS',
					item.Service?.Code ?? `service-${index}`,
					item.Service?.Description ?? `UPS service ${item.Service?.Code ?? index + 1}`,
					item.TotalCharges?.MonetaryValue,
					item.GuaranteedDelivery?.BusinessDaysInTransit,
					request,
					true,
					array(item.ItemizedCharges)
				)
			);
		}
	);
}

export function createFedexProvider(env: NodeJS.ProcessEnv): RateProvider {
	return provider(
		'fedex',
		'FedEx',
		['parcel'],
		() => !!env.FEDEX_CLIENT_ID && !!env.FEDEX_CLIENT_SECRET && !!env.FEDEX_ACCOUNT_NUMBER,
		async (request, context) => {
			const token = await oauthFedex(
				'fedex',
				'https://apis.fedex.com/oauth/token',
				env.FEDEX_CLIENT_ID!,
				env.FEDEX_CLIENT_SECRET!,
				context
			);
			const response = await requestJson(
				env.FEDEX_RATE_URL || 'https://apis.fedex.com/rate/v1/rates/quotes',
				{
					method: 'POST',
					headers: bearer(token),
					body: JSON.stringify({
						accountNumber: { value: env.FEDEX_ACCOUNT_NUMBER },
						rateRequestControlParameters: { returnTransitTimes: true },
						requestedShipment: {
							shipper: { address: { postalCode: request.originZip, countryCode: 'US' } },
							recipient: {
								address: {
									postalCode: request.destinationZip,
									countryCode: 'US',
									residential: request.residential
								}
							},
							pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
							rateRequestType: ['LIST'],
							shipDateStamp: request.shipDate,
							requestedPackageLineItems: [
								{
									weight: {
										units: 'LB',
										value: Math.round((request.weightOunces / 16) * 100) / 100
									},
									dimensions: {
										units: 'IN',
										length: Math.ceil(request.dimensions.lengthInches),
										width: Math.ceil(request.dimensions.widthInches),
										height: Math.ceil(request.dimensions.heightInches)
									},
									declaredValue:
										request.declaredValueCents === undefined
											? undefined
											: { currency: 'USD', amount: request.declaredValueCents / 100 }
								}
							]
						}
					}),
					signal: context.signal
				},
				context.fetch
			);
			return array(response.output?.rateReplyDetails).map((item: Json, index) => {
				const detail = array(item.ratedShipmentDetails)[0] ?? {};
				return normalizeGeneric(
					'fedex',
					'FedEx',
					item.serviceType ?? `service-${index}`,
					item.serviceName ?? item.serviceType ?? 'FedEx service',
					detail.totalNetCharge ?? detail.totalNetFedExCharge,
					item.commit?.transitDays?.minimumTransitTime ?? item.operationalDetail?.transitTime,
					request,
					true,
					array(detail.surcharges)
				);
			});
		}
	);
}

export function createDhlProvider(env: NodeJS.ProcessEnv): RateProvider {
	return provider(
		'dhl',
		'DHL Express',
		['parcel'],
		() => !!env.DHL_API_KEY && !!env.DHL_API_SECRET && !!env.DHL_ACCOUNT_NUMBER,
		async (request, context) => {
			const url = new URL(env.DHL_RATE_URL || 'https://express.api.dhl.com/mydhlapi/rates');
			const params = {
				accountNumber: env.DHL_ACCOUNT_NUMBER!,
				originCountryCode: 'US',
				originPostalCode: request.originZip,
				destinationCountryCode: 'US',
				destinationPostalCode: request.destinationZip,
				weight: String(request.weightOunces / 16),
				length: String(request.dimensions.lengthInches),
				width: String(request.dimensions.widthInches),
				height: String(request.dimensions.heightInches),
				plannedShippingDate: request.shipDate,
				isCustomsDeclarable: 'false',
				unitOfMeasurement: 'imperial'
			};
			Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
			const response = await requestJson(
				url.toString(),
				{
					method: 'GET',
					headers: {
						authorization: `Basic ${Buffer.from(`${env.DHL_API_KEY}:${env.DHL_API_SECRET}`).toString('base64')}`
					},
					signal: context.signal
				},
				context.fetch
			);
			return array(response.products).map((item: Json, index) =>
				normalizeGeneric(
					'dhl',
					'DHL Express',
					item.productCode ?? `service-${index}`,
					item.productName ?? 'DHL Express',
					item.totalPrice?.[0]?.price ?? item.totalPrice,
					item.deliveryCapabilities?.totalTransitDays,
					request,
					true,
					array(item.detailedPriceBreakdown)
				)
			);
		}
	);
}
