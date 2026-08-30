declare module '*.css';

declare const __EXACT_COMPARISON_PROFILE__: boolean;

interface Window {
	__exactComparisonProfileEvents?: Array<{
		subsystem: string;
		phase: string;
		elapsedMs: number;
	}>;
}
