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
			'task-state-contracts'
		],
		'Equal setter invocation, indexed getter counts, native method identity, ordinary reactive accessor and inherited runtime behavior. Pending class members are explicitly bounded. Unchanged helpers cannot emulate unavailable receiver brands or roll back external effects.'
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
		[
			'task-type-families',
			'task-imported-types',
			'task-symbol-types',
			'secret-type-policy',
			'enhancement-template-types'
		],
		'Component-observed conditional/mapped/template types, generic callbacks, overloads, ambient signatures and unique-symbol identity have valid/invalid controls. Quoted enhancement templates share ordinary string expression constraints. This does not inventory every type syntax combination.'
	),
	feature(
		'operators-and-evaluation',
		'transformed',
		'native expression and state effect lowering',
		['semantic-exploration', 'component-evaluation-edges'],
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
		['ordinary-enum-namespace-decorator'],
		'Ordinary enum, namespace and decorated helper emission with component task arguments. Decorated component definitions and class reconstruction are outside this evidence.'
	),
	feature(
		'resource-management',
		'pass-through',
		'upstream emitter and owned resource boundaries',
		['lexical-task-resource-disposal'],
		'Task-local using and await using retain native lexical disposal before successful publication and caught abrupt completion with ESNext.Disposable configured. They do not automatically register component-lifetime resources.'
	),
	feature(
		'javascript-module-forms',
		'transformed',
		'native module selection and component discovery',
		['helper-module-selection', 'module-publication'],
		'Executable .js/.mjs/.jsx helper erasure and source maps, paired .mts/.mjs exports and declarations, and rejected .cts/.cjs library inputs. Native checked-JavaScript component semantics and CommonJS application helpers remain unverified.'
	),
	feature(
		'literals-regexp-and-template-strings',
		'pass-through',
		'upstream parser and emitter',
		['component-literal-and-tagged-values'],
		'Bigint arithmetic, regexp flags, Unicode values and tagged raw/cooked template data execute in tasks. This does not permit bigint in unsupported transport serialization.'
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
			'type-only-policy-overlap',
			'paired-props',
			'helper-publication',
			'task-helper-contracts',
			'helper-call-selection'
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
		['checking-semantics', 'task-type-families', 'task-imported-types', 'task-capture-types'],
		'Annotated unions, guarded optional values, discriminant narrowing, callbacks and native readonly assignability with invalid controls. Selected assertions, satisfies and assignment results also cross actual server executors.'
	),
	feature(
		'lexical-scope-and-this',
		'transformed',
		'native binding and capture analysis',
		['core-import-identity', 'helper-call-selection'],
		'Component-local closures and ordinary helper inputs, with invocation-scoped views. General class and factory compilation is outside the component contract. Core structural imports shadowed by local component aliases and ordinary same-named registry factories have paired runtime controls. Helper aliases, lexical shadowing, explicit extracted-method receivers and immediately invoked higher-order calls have mount/hydration controls. Other callback-produced closures and returned object methods remain unverified.'
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
		['component-evaluation-edges', 'task-helper-evaluation'],
		'Component task break/continue, exceptional iterator closing, sparse/custom destructuring and async iterator break, plus unchanged helper loop destinations. Direct component state loop-header assignment remains diagnosed.'
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
		['semantic-exploration', 'task-state-contracts', 'optional-chain-render-flow'],
		'Nullish and short-circuit selection, optional helper and native member calls, optional deletes, non-null continuations and explicit chain breaks across task captures, and logical task assignments. This bounded workflow does not exhaust nested operator combinations.'
	),
	feature(
		'classes-and-private-members',
		'pass-through',
		'ordinary JavaScript execution and explicit pending receiver boundaries',
		['ordinary-helper-inputs', 'helper-view-diagnostics', 'helper-state-bridges'],
		'Classes keep their original implementations. Ordinary helper receivers may use private configuration while mutating supplied supported state inputs. Pending class receivers are rejected. Explicit capabilities preserve readonly and invocation lifetime. This does not promise transactional private storage, decorators, prototype changes or arbitrary class reconstruction.'
	),
	feature(
		'generators-and-tagged-templates',
		'pass-through',
		'upstream TypeScript emitter',
		['component-evaluation-edges', 'component-literal-and-tagged-values', 'tagged-template-types'],
		'Ordinary sync/async generators consumed by component tasks retain selected closing behavior. Member tags preserve receiver, site identity, key/getter/substitution ordering and generic typing. Generator component definitions remain outside this contract.'
	),
	feature(
		'module-imports-and-reexports',
		'transformed',
		'native module discovery and paired artifact relocation',
		['module-publication', 'task-helper-contracts'],
		'Paired transitive exports, NodeNext relocation and source-removed helper consumers. Deferred and aliased imports and independently installed split-build consumers require separate evidence.'
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
			'type-policy-to-disclosure',
			'contract',
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
		...feature(
			'ordinary-helper-state-inputs',
			'contract',
			'component invocation -> ordinary helper -> reactive state view',
			[
				'ordinary-helper-inputs',
				'helper-view-diagnostics',
				'helper-state-bridges',
				'pending-owner-overlap',
				'pending-owner-sequences'
			],
			'Equivalent original and project helper behavior, external-effect controls, explicit identity, readonly enforcement, view lifetime and independent bundle elimination. Diagnostics recognize direct parameter equality and returned closure captures. Opaque helpers, arbitrary transitive retention and dynamic class member selection rely on documented limits and runtime guards.'
		),
		producer: 'Supply invocation-owned state views without rewriting ordinary helper bodies.',
		consumer:
			'Use supported inputs within their lifetime and preserve native equality and external effects.'
	},
	{
		...feature(
			'task-to-pending-publication',
			'contract',
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
		...feature(
			'pattern-to-reactive-state',
			'contract',
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
		...feature(
			'helper-to-placement-and-authority',
			'contract',
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
		...feature(
			'component-to-paired-consumer',
			'contract',
			'component normalization -> paired SSR/hydration artifacts',
			['paired-props', 'pending-owner-overlap', 'pending-owner-sequences'],
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
		...feature(
			'enhancement-to-owned-host',
			'contract',
			'enhancement projection -> DOM adoption and lifecycle',
			['composition-transitions', 'pending-owner-overlap', 'pending-owner-sequences'],
			'Planned, spread and enhanced paths in workspace source and full-root hydration, including defaulted prop rebinding while helper work is pending, keyed host replacement and stale task disposal.'
		),
		producer: 'Preserve host topology and keep namespace props out of SSR HTML.',
		consumer: 'Adopt identities, refresh handlers and release ownership on disposal.'
	},
	{
		...feature(
			'installed-split-builds',
			'contract',
			'library producer -> installed adapter consumer',
			['vite', 'webpack', 'bun'].map((host) => host + '-installed-split-islands'),
			'Physically installed paired library with producer source removed. Buffered/progressive server parent, private eager/lazy registry child, repeated continuation updates, DOM identity, edited input, replacement, cleanup and missing/incompatible artifact controls. Eager registration is composed from executable component contracts. Automatic package bootstrap discovery and real-browser coverage remain separate.'
		),
		producer: 'Carry portable placement and ownership contracts across publication.',
		consumer: 'Resolve and activate components consistently across supported adapters and runtimes.'
	}
];
