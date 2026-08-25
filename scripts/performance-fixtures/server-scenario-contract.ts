/** Portable measurements and their explicit units for one server workload sample. */
export type ServerScenarioResult = Readonly<{
	metrics: Readonly<Record<string, number>>;
	units: Readonly<Record<string, 'bytes' | 'count' | 'ms'>>;
}>;
