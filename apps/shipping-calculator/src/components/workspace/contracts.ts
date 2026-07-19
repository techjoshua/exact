import type {
	InitialModel,
	ProviderId,
	ProviderResult,
	QuoteSort,
	RouteResult,
	ShipmentDraft
} from '../../types.js';

/** Tracks the state owned by page. */
export type PageState = { model: InitialModel };
/** Tracks the state owned by workspace. */
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
