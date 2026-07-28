import type { ProviderId } from '../types.js';

const providerNames: Record<ProviderId, string> = {
	doop: 'DOOP',
	usps: 'USPS',
	ups: 'UPS',
	fedex: 'FedEx',
	dhl: 'DHL Express'
};

/** Returns the display name for a configured quote provider. */
export function providerName(id: ProviderId): string {
	return providerNames[id];
}
