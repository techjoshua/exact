function feature(id, kind, owner, evidence, limit, gap) {
	return { id, kind, owner, witnesses: evidence, limit, ...(gap ? { gap } : {}) };
}

/** Language families with explicit handling, bounded evidence, and unresolved acceptance work. */
export const languageFeatures = [
	feature(
		'authored-mutation-type-obligations',
		'transformed',
		'native checking projection and mutation result facts',
		['mutation-type-contracts'],
		'Destination, readonly, key, operator, method argument, callback context and result controls. The suite does not exhaust all contextual generic forms.'
	),
	feature(
		'flow-narrowing-preservation',
		'transformed',
		'native authored read provenance',
		['mutation-type-contracts', 'checking-semantics'],
		'Guarded and unsafe read controls across checking and executable targets.'
	),
	feature(
		'collection-method-identity',
		'transformed',
		'native library method symbols and runtime intrinsic identity',
		['mutation-type-contracts', 'mutation-transitions'],
		'Native and ordinary custom calls. Function-bearing and subclass state remains subject to hydration serialization.'
	),
	feature(
		'suspension-in-state-mutations',
		'transformed',
		'native invocation-local mutation and destructuring plans',
		['mutation-type-contracts', 'mutation-transitions'],
		'Compound and logical assignment, awaited call arguments, keys and destructuring controls. Generator controls remain bounded exploration.'
	),
	feature(
		'task-signature-and-argument-capture',
		'transformed',
		'native public task signatures and ordered capture resolver',
		['mutation-type-contracts', 'task-state-contracts'],
		'Literal, state, object, tuple and dependent defaults, including direct SSR. Helper parameter defaults and native destructuring consume pending values. Remote transport has separate continuation witnesses.'
	),
	feature(
		'accessor-and-overridden-method-effects',
		'transformed',
		'reactive descriptor writes and native intrinsic bookkeeping',
		[
			'accessor-effects',
			'subclass-receivers',
			'pending-transaction-engine',
			'helper-unary-reads',
			'task-state-contracts'
		],
		'Equal setter invocation, indexed getter counts, native method identity, compiled private brands and inherited accessors. Private publication has inverse and computed-cache controls. Unchanged helpers cannot emulate unavailable receiver brands or roll back external effects.'
	),
	feature(
		'server-task-self-output-dependencies',
		'transformed',
		'native shared task-local read and predecessor ownership plan',
		['task-state-contracts', 'task-helper-contracts', 'mutation-transitions'],
		'Direct and conditional writes, captured defaults, eager collection results, helper argument ownership and repeated publication. Dynamic alias targets and genuine inter-task cycles need separate scheduling witnesses.'
	),
	feature(
		'jsx-children-attributes-and-callbacks',
		'transformed',
		'native JSX lowering and render programs',
		['composition-transitions', 'checking-semantics', 'helper-jsx-completion'],
		'Representative intrinsic props, callbacks, component children and enhanced hosts. Arbitrary spreads and nested expression combinations need separate witnesses.'
	),
	feature(
		'type-declarations-and-generics',
		'pass-through',
		'upstream checker and native checking projection',
		[],
		'Aliases and interfaces occur in executed fixtures, but that does not inventory all type syntax.',
		'Cross generic constraints, conditional and mapped types, template literal types, overloads and ambient declarations with compiler-observed values.'
	),
	feature(
		'operators-and-evaluation',
		'transformed',
		'native expression and state effect lowering',
		['semantic-exploration', 'helper-unary-reads'],
		'Private and inherited unary reads versus updates, zero, absent values, nullish selection, getters, computed keys and iterator closing. Assignment result values, abrupt completion and remaining operators need separate witnesses.'
	),
	feature(
		'functions-and-call-forms',
		'transformed',
		'native callable discovery and effect analysis',
		['helper-authority', 'checking-semantics'],
		'Selected helpers and JSX callbacks, ordinary receivers, class fields and static blocks, and computed member names.',
		'Overloads and higher-order escapes remain separate candidates.'
	),
	feature(
		'enums-namespaces-and-decorators',
		'pass-through',
		'upstream emitter and module analysis',
		[],
		'No evidence is claimed for component transformations in these constructs.',
		'Establish ordinary emission behavior and explicit diagnostics at component-definition boundaries.'
	),
	feature(
		'resource-management',
		'pass-through',
		'upstream emitter and owned resource boundaries',
		[],
		'Using and await using are not covered by this workflow.',
		'Verify disposal and exception behavior before claiming integration with component or task lifetime.'
	),
	feature(
		'javascript-module-forms',
		'transformed',
		'native module selection and component discovery',
		[],
		'Existing .js/.jsx discovery checks are separate from TSX evidence.',
		'Connect checked JS, CommonJS and alternate module extensions to executed compiler and adapter cases.'
	),
	feature(
		'literals-regexp-and-template-strings',
		'pass-through',
		'upstream parser and emitter',
		[],
		'Ordinary literals appear in fixtures without establishing all literal semantics.',
		'Execute bigint, regexps, Unicode escapes and tagged-template identity across pass-through and captured expressions.'
	),
	feature(
		'destructured-derived-declarations',
		'transformed',
		'native derived_pattern_lowering',
		['derived-types', 'derived-updates'],
		'Aliases, nesting, defaults, rest and computed keys. Broader iterator and accessor behavior is unverified.'
	),
	feature(
		'destructured-prop-parameters',
		'transformed',
		'native component normalization',
		['paired-props'],
		'Direct and destructured props with defaults, renaming and imported helpers in workspace paired builds.'
	),
	feature(
		'destructuring-state-assignment',
		'transformed',
		'native state effects and task/event lowering',
		['semantic-exploration'],
		'Object and array assignments to a whole state slot in synchronous events. Nested targets and for-of targets need separate evidence.'
	),
	feature(
		'state-read-access-forms',
		'transformed',
		'native indexed reads and dependency analysis',
		['semantic-exploration'],
		'Direct, literal and computed array reads, derived patterns, helper calls and short-circuit selection.'
	),
	feature(
		'helper-receiver-effects',
		'transformed',
		'native callable effect resolution',
		[
			'helper-authority',
			'paired-props',
			'helper-publication',
			'task-helper-contracts',
			'published-class-helpers'
		],
		'Parameter receiver paths, imported and source-removed helper publication, unchanged external helpers, and rejected unknown remote writes. Does not cover all alias and call forms.'
	),
	feature(
		'reevaluated-expression-purity',
		'diagnostic',
		'native derived value diagnostics',
		['derived-purity'],
		'Effectful destructuring defaults must be rejected with causal context.'
	),
	feature(
		'type-erasure-and-narrowing',
		'transformed',
		'native checking projection',
		['checking-semantics'],
		'Annotated unions, guarded optional values, discriminant narrowing and callback typing with invalid controls. Generics, assertions and satisfies need separate witnesses.'
	),
	feature(
		'lexical-scope-and-this',
		'transformed',
		'native binding and capture analysis',
		[],
		'Ordinary function, object-method and class-method receivers have checking and behavioral controls. Class initialization and computed member names have separate receiver controls.',
		'Cross shadowing, closures, lexical this, method receivers and callable aliases with state dependencies.'
	),
	feature(
		'async-control-flow',
		'transformed',
		'native continuation lowering',
		['checking-semantics', 'helper-publication'],
		'Awaited object assignment typing and imported helper publication with stale response and disposal checks. General catch/finally control flow needs separate witnesses.'
	),
	feature(
		'loops-and-iteration',
		'transformed',
		'native collection and state effect analysis',
		[],
		'Syntax corpus compilation is not behavioral evidence.',
		'Verify for-of targets, iterator closing, break/continue and sparse arrays at transformed boundaries.'
	),
	feature(
		'object-and-array-spreads',
		'transformed',
		'native collection projections',
		['collection-transitions'],
		'Collection snapshots and projections, ordering, insertion, replacement, removal and retained keyed identity. Arbitrary accessor copy semantics need separate witnesses.'
	),
	feature(
		'optional-and-logical-operators',
		'transformed',
		'native expression lowering',
		['semantic-exploration', 'task-state-contracts'],
		'Nullish and short-circuit selection, optional helper and native member calls, optional deletes, and logical task assignments. This bounded workflow does not exhaust nested operator combinations.'
	),
	feature(
		'classes-and-private-members',
		'transformed',
		'upstream class emission, native helper companions and reactive private publication',
		['task-state-contracts', 'pending-transaction-engine', 'published-class-helpers'],
		'Compiled public accessors over private fields, inherited membership, three-level getter selection and private updates have executable controls. Private callable/accessor members, decorators, class expressions and arbitrary computed companion names need separate evidence.'
	),
	feature(
		'generators-and-tagged-templates',
		'pass-through',
		'upstream TypeScript emitter',
		[],
		'Syntax corpus includes generators and tagged templates.',
		'Execute ordering, receiver and iterator semantics. Do not infer transformed component support.'
	),
	feature(
		'module-imports-and-reexports',
		'transformed',
		'native module discovery and paired artifact relocation',
		[],
		'Existing adapter and library-build suites remain required.',
		'Connect static, deferred, aliased and reexported helper resolution to installed producer/consumer evidence.'
	),
	feature(
		'unsupported-dynamic-boundaries',
		'diagnostic',
		'native placement and finite write authority',
		['helper-authority'],
		'Reject unproven remote helper writes. Loop-header and reflective-mutation diagnostics follow proven helper arguments and receivers, immutable aliases, computed literal members and native call/apply/bind invocation adapters.',
		'Support or diagnose equivalent owned effects by resolved operation identity and receiver provenance.'
	)
];

/** Producer obligations and consumer guarantees at representative compiler contract edges. */
export const contractEdges = [
	{
		...feature(
			'task-to-pending-publication',
			'contract',
			'native invocation effects -> reactive pending engine -> core task journal',
			[
				'task-state-contracts',
				'task-helper-contracts',
				'published-class-helpers',
				'pending-transaction-engine',
				'mutation-transitions'
			],
			'Client task publication, direct SSR controls, source-removed helpers, suspension, replacement, parallel isolation, discard, private rollback and subsequent progress. Unchanged helper identity outside its facade and opaque external effects remain explicit limits.'
		),
		producer:
			'Carry explicit invocation ownership and select original receivers and arguments before execution.',
		consumer:
			'Publish one current-generation transition and release stale pending storage and mutation capabilities.'
	},
	{
		...feature(
			'pattern-to-reactive-state',
			'contract',
			'native derived lowering -> reactive dependency consumers',
			['derived-types', 'derived-updates', 'semantic-exploration'],
			'Checking/client/server semantic success and mount/hydration updates. Simulated DOM only.'
		),
		producer:
			'Retain native pattern selection and live dependencies without changing evaluation semantics.',
		consumer: 'Observe committed state changes with retained DOM identity and correct defaults.'
	},
	{
		...feature(
			'helper-to-placement-and-authority',
			'contract',
			'native callable analysis -> placement and server write validation',
			['helper-authority', 'helper-publication'],
			'Native analysis, server diagnostics and loopback dispatch. Adapter resolution is outside this witness.'
		),
		producer:
			'Publish effects relative to proven receiver paths and widen uncertain recursive paths.',
		consumer: 'Unknown or nonfinite effects cannot grant remote state write authority.'
	},
	{
		...feature(
			'component-to-paired-consumer',
			'contract',
			'component normalization -> paired SSR/hydration artifacts',
			['paired-props'],
			'Workspace paired artifacts with imported helpers. Independently installed libraries are a separate boundary.'
		),
		producer: 'Publish a self-contained component contract that preserves prop binding and types.',
		consumer:
			'Adopt server DOM and update props without requiring usage-specific component compilation.'
	},
	{
		...feature(
			'props-to-keyed-owner',
			'contract',
			'prop publication -> child dependency ownership',
			['prop-source-identity', 'composition-transitions'],
			'Mount/hydration replacement, retained updates, removal and disposal in jsdom.'
		),
		producer: 'Publish changes in source identity even when current values are equal.',
		consumer: 'Retain same-key owners, rebind to new sources and release removed owners.'
	},
	{
		...feature(
			'enhancement-to-owned-host',
			'contract',
			'enhancement projection -> DOM adoption and lifecycle',
			['composition-transitions'],
			'Planned, spread and enhanced paths in workspace source and full-root hydration.'
		),
		producer: 'Preserve host topology and keep namespace props out of SSR HTML.',
		consumer: 'Adopt identities, refresh handlers and release ownership on disposal.'
	},
	{
		...feature(
			'installed-split-builds',
			'contract',
			'library producer -> installed adapter consumer',
			[],
			'Existing packed workbench and adapter suites remain necessary.',
			'This workflow does not yet ingest installed split-island, adapter or native HTTP runtime execution evidence.'
		),
		producer: 'Carry portable placement and ownership contracts across publication.',
		consumer: 'Resolve and activate components consistently across supported adapters and runtimes.'
	}
];
