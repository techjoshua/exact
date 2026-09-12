/** Percentile values admitted by the benchmark report. */
interface DistributionStatistics {
	readonly mean: number;
	readonly p50: number;
	readonly p75: number;
	readonly p95: number;
	readonly p99: number;
}

/** A benchmark distribution rendered without recomputing its statistics. */
export interface DistributionChart {
	readonly title: string;
	readonly unit: string;
	readonly precision: number;
	readonly comment: string;
	readonly series: readonly {
		readonly name: string;
		readonly stats: DistributionStatistics;
		readonly aggregate?: number;
	}[];
}

/** Scalar benchmark measurements with their display units. */
export interface ValueChart {
	readonly title: string;
	readonly unit: string;
	readonly precision: number;
	readonly comment: string;
	readonly values: readonly {
		readonly name: string;
		readonly value: number;
	}[];
}

/** Per-framework document byte categories. */
export interface ResponseCompositionChart {
	readonly title: string;
	readonly unit: string;
	readonly categories: readonly string[];
	readonly series: readonly { readonly name: string; readonly values: readonly number[] }[];
	readonly comment: string;
}

/** Published browser and SSR data consumed by the performance page. */
export interface PerformanceReport {
	readonly metadata: {
		readonly commit: string;
		readonly ssrCommit: string;
		readonly ssrSourceSha256: string;
		readonly createdAt: string;
		readonly browserCreatedAt: string;
		readonly ssrCreatedAt: string;
		readonly browserSamples: number;
		readonly ssrSequentialSamples: number;
		readonly ssrBurstSamples: number;
		readonly ssrRetentionCheckpoints: number;
		readonly ssrDiagnosticsEnvironment: {
			readonly runtimes: { readonly node: string; readonly bun: string };
		};
	};
	readonly summary: readonly {
		readonly label: string;
		readonly value: string;
		readonly context: string;
	}[];
	readonly browserCharts: readonly DistributionChart[];
	readonly server: {
		readonly bun: {
			readonly runtime: string;
			readonly createdAt: string;
			readonly sequentialSamples: number;
			readonly burstSamples: number;
			readonly retentionCheckpoints: number;
			readonly bars: readonly ValueChart[];
			readonly responseComposition: ResponseCompositionChart;
			readonly burst: DistributionChart;
			readonly sequential: DistributionChart;
			readonly retention: DistributionChart;
		};
		readonly burst: DistributionChart;
		readonly sequential: DistributionChart;
		readonly retention: DistributionChart;
		readonly bars: readonly ValueChart[];
		readonly responseComposition: ResponseCompositionChart;
	};
}
