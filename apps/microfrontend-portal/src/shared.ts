import { createContext } from '@exact/core';

/** Live page-owned state intentionally shared across independently built roots. */
export type PortalContextValue = {
	tenant: string;
	accountId: string;
	accent: string;
	mode: 'light' | 'dark';
};

/** The page publishes this package so every remote imports the same context token. */
export const PortalContext = createContext<PortalContextValue>('sample.microfrontend.portal', {
	global: true,
	reactive: true
});
