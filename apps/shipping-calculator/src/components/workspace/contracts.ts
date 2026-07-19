import type {
	InitialModel,
	ProviderId,
	ProviderResult,
	QuoteSort,
	RouteResult,
	ShipmentDraft
} from '../../types.js';

export type PageState = { model: InitialModel };
export type WorkspaceState = {
	draft: ShipmentDraft;
	providers: ProviderResult[];
	route: RouteResult;
	revision: number;
	loading: ProviderId[];
	error?: string;
	sort: QuoteSort;
	enabledFilters: ProviderId[];
	restored: boolean;
};
