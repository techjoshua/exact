/** Static task wiring emitted once per compiler-closed server component transition. */
export type ServerComponentTaskSlice = readonly [
	/** Authored argument positions mapped to a predecessor output port, or -1 for the authored value. */
	inputs: readonly number[],
	/** Output port and component-state path pairs published after successful work. */
	outputs: readonly (readonly [port: number, path: readonly string[]])[],
	readiness: 'blocking' | 'nonblocking',
	label: string
];

/** Request-local ownership used by a compiler-closed scheduled server component. */
export type ServerComponentExecutionFrame = AsyncDisposable &
	Readonly<{
		run<T>(work: () => T): T;
		readonly blockingVersion: number;
		/** Selects already-issued blocking work by opaque compiler transition identity. */
		blockingWork(transitions?: ReadonlySet<string>): Promise<void> | undefined;
		/** Request-local change token for the selected task completions. */
		blockingVersionFor(transitions: ReadonlySet<string>): number;
	}>;

/** Request-owned scheduling and publication policies supplied by the server renderer. */
export type ServerExecutionOptions = Readonly<{
	/** Enables selected readiness queries when a compiler output-span plan requires them. */
	trackTaskIdentities?: boolean;
	/** Tasks whose captured output requires full settlement before publication. */
	publicationDependencies?: ReadonlySet<string>;
	observe?(settlement: Promise<unknown>): void;
	runTask?<T>(work: () => Promise<T>): Promise<T>;
	/** Reads a compiler-proven output region after its request-owned task dependencies settle. */
	prepareOutput?<T>(read: () => T): T | Promise<T>;
}>;
