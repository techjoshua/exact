function contract(id, owner, evidence, limit) {
	return { id, kind: 'contract', owner, witnesses: evidence, limit };
}

/** Producer obligations and consumer guarantees at representative compiler contract edges. */
export const contractEdges = [
	{
		...contract(
			'capture-dependencies-to-consumers',
			'per-use source capture and member-write dependencies -> target exports and reactive consumers',
			['shared-capture-composition'],
			'The unchanged projected closure and safe RHS require actual paired artifacts and once-only browser reads. A nested captured state read updates the same mounted instance without replaying an unrelated consumer. SSR and disposal are checked in Node-hosted Vitest/jsdom. This does not establish adapter, real-browser hydration, installed-package or cross-runtime acceptance.'
		),
		producer:
			'Preserve the captured binding/object relationship and applicable member-write dependencies independently of exact runtime values.',
		consumer:
			'Project authorized target exports and update only the affected retained component work, preserving runtime evaluation and cleanup.'
	},
	{
		...contract(
			'type-policy-to-disclosure',
			'resolved qualification declarations -> component data-policy sinks',
			[
				'secret-type-policy',
				'callable-result-policy',
				'aliased-component-policy',
				'secret-server-render-containment',
				'server-task-secret-execution',
				'inferred-secret-task-placement',
				'generated-task-secret-wire',
				'type-only-policy-overlap',
				...['vite', 'webpack', 'bun'].map((host) => host + '-imported-helper-policy')
			],
			'Checking/client/server analysis of direct and aliased secret types. Imported readonly members, method results, records, indexed collections and public siblings have paired controls. Compiled server-owned credentials remain absent from buffered hydration and streamed response bytes before client execution. This does not exhaust opaque dependencies, provider implementations or all serialization boundaries.'
		),
		producer: 'Preserve secret qualification through resolved types and selected data members.',
		consumer:
			'Reject disclosure and ordinary unqualified consumers without rejecting public sibling fields.'
	},

	{
		...contract(
			'ordinary-helper-state-inputs',
			'component invocation -> ordinary helper -> reactive state view',
			[
				'ordinary-helper-inputs',
				'helper-view-diagnostics',
				'helper-state-bridges',
				'pending-owner-overlap',
				'pending-owner-sequences'
			],
			'Equivalent original and project helper behavior, external-effect controls, explicit identity, TypeScript readonly checking, view lifetime and independent bundle elimination. Diagnostics recognize direct parameter equality and returned closure captures. Opaque helpers, arbitrary transitive retention and dynamic class member selection rely on documented limits and runtime guards.'
		),
		producer: 'Supply invocation-owned state views without rewriting ordinary helper bodies.',
		consumer:
			'Use supported inputs within their lifetime and preserve native equality and external effects.'
	},
	{
		...contract(
			'task-to-pending-publication',
			'native invocation effects -> reactive pending engine -> core task journal',
			[
				'task-state-contracts',
				'task-helper-contracts',
				'pending-transaction-engine',
				'pending-owner-overlap',
				'pending-owner-sequences',
				'mutation-transitions'
			],
			'Client task publication, direct SSR controls, source-removed helpers, suspension, replacement, parallel isolation, discard and subsequent progress. Unchanged helper identity outside its facade and opaque external effects remain explicit limits.'
		),
		producer:
			'Carry explicit invocation ownership and select original receivers and arguments before execution.',
		consumer:
			'Publish one current-generation transition and release stale pending storage and mutation capabilities.'
	},
	{
		...contract(
			'pattern-to-reactive-state',
			'native derived lowering -> reactive dependency consumers',
			[
				'derived-types',
				'derived-updates',
				'semantic-exploration',
				'derived-reference-identity',
				'disposed-derived-values',
				'pending-owner-overlap',
				'pending-owner-sequences'
			],
			'Checking/client/server semantic success and mount/hydration updates. Simulated DOM only.'
		),
		producer:
			'Retain native pattern selection and live dependencies without changing evaluation semantics.',
		consumer: 'Observe committed state changes with retained DOM identity and correct defaults.'
	},
	{
		...contract(
			'helper-to-placement-and-authority',
			'native callable analysis -> placement and server write validation',
			[
				'helper-authority',
				'type-only-policy-overlap',
				'helper-publication',
				...['vite', 'webpack', 'bun'].map((host) => host + '-imported-helper-policy')
			],
			'Native analysis, server diagnostics and loopback dispatch, plus imported finite/dynamic write controls through Vite/Webpack/native Bun for both targets. Opaque transitive effects remain bounded.'
		),
		producer:
			'Publish effects relative to proven receiver paths and widen uncertain recursive paths.',
		consumer: 'Unknown or nonfinite effects cannot grant remote state write authority.'
	},
	{
		...contract(
			'component-to-paired-consumer',
			'component normalization -> paired SSR/hydration artifacts',
			['paired-props', 'pending-owner-overlap', 'pending-owner-sequences'],
			'Workspace paired artifacts with imported helpers. Independently installed libraries are a separate boundary.'
		),
		producer: 'Publish a self-contained component contract that preserves prop binding and types.',
		consumer:
			'Adopt server DOM and update props without requiring usage-specific component compilation.'
	},
	{
		...contract(
			'props-to-keyed-owner',
			'prop publication -> child dependency ownership',
			[
				'prop-source-identity',
				'composition-transitions',
				'pending-owner-overlap',
				'pending-owner-sequences'
			],
			'Mount/hydration replacement, retained updates, removal and disposal in jsdom.'
		),
		producer: 'Publish changes in source identity even when current values are equal.',
		consumer: 'Retain same-key owners, rebind to new sources and release removed owners.'
	},
	{
		...contract(
			'enhancement-to-owned-host',
			'enhancement projection -> DOM adoption and lifecycle',
			['composition-transitions', 'pending-owner-overlap', 'pending-owner-sequences'],
			'Planned, spread and enhanced paths in workspace source and full-root hydration, including defaulted prop rebinding while helper work is pending, keyed host replacement and stale task disposal.'
		),
		producer: 'Preserve host topology and keep namespace props out of SSR HTML.',
		consumer: 'Adopt identities, refresh handlers and release ownership on disposal.'
	},
	{
		...contract(
			'installed-split-builds',
			'library producer -> installed adapter consumer',
			['vite', 'webpack', 'bun'].map((host) => host + '-installed-split-islands'),
			'Physically installed paired library with producer source removed. Buffered/progressive server parent, private eager/lazy registry child, repeated continuation updates, DOM identity, edited input, replacement, cleanup and missing/incompatible artifact controls. Eager registration is composed from executable component contracts. Automatic package bootstrap discovery and real-browser coverage remain separate.'
		),
		producer: 'Carry portable placement and ownership contracts across publication.',
		consumer: 'Resolve and activate components consistently across supported adapters and runtimes.'
	}
];
