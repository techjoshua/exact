const compiler = 'packages/compiler/src/';
const corpus = 'packages/component-composition-corpus/src/';

/** Exact behavioral and diagnostic witnesses consumed from fresh execution reports. */
export const witnesses = [
	{
		id: 'helper-private-routing',
		file: compiler + 'compilation/task-private-routing.test.ts',
		environment:
			'client and server artifacts, ordinary controls, class expressions, collection readonly aliases, commit, discard and stale invocations',
		tests: [
			'private-method',
			'private-arrow-field',
			'private-accessor',
			'public-method-control'
		].flatMap((name) =>
			[
				['plain', 'declaration'],
				['plain', 'expression'],
				['array', 'declaration']
			].flatMap(([substrate, form]) =>
				['client', 'server'].map(
					(target) =>
						`retains private receiver and pending publication for ${name} (${target}, ${substrate}, ${form})`
				)
			)
		)
	},
	{
		id: 'helper-private-transitions',
		file: compiler + 'compilation/task-private-transitions.test.ts',
		environment:
			'client and server artifacts, accessor effects, private brands, escaped bindings, lexical super, evaluation order and recovery',
		tests: [
			'retains readonly ownership in escaped private bindings',
			'rejects private writes to an owned receiver without its brand before publication',
			'executes private setters eagerly and recovers after abrupt completion',
			'retains private getter brands even when its body reads no fields',
			'routes escaped private bindings through the eventual transaction',
			'retains field arrow super through subclassing and class-name replacement',
			'selects private receivers before arguments exactly once'
		].flatMap((name) => ['client', 'server'].map((target) => `${name} (${target})`))
	},
	{
		id: 'helper-receiver-policy',
		file: 'packages/reactive/src/pending/helper-routing.test.ts',
		environment:
			'explicit reactive transactions, nested branded calls, explicit writable aliases and publication',
		tests: ['private', 'property', 'array', 'delete']
			.flatMap((write) =>
				[false, true].flatMap((cross) =>
					[true, false].map(
						(owned) =>
							`retains readonly aliases through nested ${write} work, cross receiver=${cross}, owned=${owned}`
					)
				)
			)
			.concat([
				'inherits lexical super home from an already registered private companion',
				'preserves an external readonly receiver when a compiled helper calls unchanged code',
				'preserves an external readonly argument when a compiled helper calls unchanged code',
				'retains readonly arguments in escaped bindings to unchanged helpers',
				...[true, false].map(
					(owned) =>
						`publishes a writable native collection alias after retaining its readonly view, owned=${owned}`
				)
			])
	},
	{
		id: 'helper-unary-reads',
		file: compiler + 'compilation/task-helper-unary.test.ts',
		environment:
			'client and server artifacts, native helper providers, pending reads and subsequent private-field publication',
		tests: ['-', '+', '~', '!'].flatMap((operator) =>
			['super.value', 'this.#count'].flatMap((member) =>
				['client', 'server'].map(
					(target) => `retains ${operator}${member} as a read in a pending class helper (${target})`
				)
			)
		)
	},
	{
		id: 'helper-jsx-completion',
		file: compiler + 'compilation/task-helper-jsx.test.ts',
		environment:
			'client DOM and server rendering through native helper providers, commit and discard',
		tests: ['method', 'getter', 'parameter'].flatMap((form) =>
			['client', 'server'].map(
				(target) => `renders ${form} JSX through original and pending class helpers (${target})`
			)
		)
	},
	{
		id: 'published-class-helpers',
		file: compiler + 'compilation/task-published-class-helpers.test.ts',
		environment:
			'source-removed class producer, declaration-only consumer, jsdom pending private state and native collections',
		tests: ['success', 'replace', 'dispose'].map(
			(scenario) =>
				`publishes source-removed zero-argument class helpers with private and collection state (${scenario})`
		)
	},
	{
		id: 'task-helper-contracts',
		file: compiler + 'compilation/task-helper-publication.test.ts',
		environment:
			'client artifacts, source-removed producer JavaScript and declarations, jsdom publication and cancellation',
		tests: [
			'imported asynchronous helper',
			'external asynchronous helper',
			'published asynchronous helper',
			'published external asynchronous helper'
		].flatMap((form) =>
			['latest', 'parallel'].flatMap((policy) =>
				[false, true].map(
					(removal) => `preserves ${form} ${policy} disposal=${removal} finally and publication`
				)
			)
		)
	},
	{
		id: 'pending-transaction-engine',
		file: 'packages/reactive/src/pending/pending-transaction.test.ts',
		environment:
			'standalone reactive transactions, private inverse publication and pending collection lifetime',
		tests: [
			'preserves native Date brands through direct, borrowed and unchanged helper readers',
			'rejects owned Date timestamp mutation before effects and permits value replacement',
			'isolates overlapping pending views across suspension and publishes one coherent transition',
			'supplies unchanged helpers with shared pending property and collection semantics',
			'preserves authored arguments through direct and captured collection helper selection',
			'restores published private storage and computed accessors when a later publication fails',
			'publishes touched nested references into each reconciled owner',
			'adopts pending collection values consistently during iteration',
			'fences retained collection cursors after commit',
			'fences retained collection cursors after discard'
		]
	},
	{
		id: 'checking-semantics',
		file: compiler + 'native/checking-projection.test.ts',
		environment: 'native checking and executable-target diagnostics',
		tests: [
			'annotated derived union',
			'guarded optional state',
			'local discriminant narrowing',
			'keyed JSX function and block callbacks',
			'awaited object assignment',
			'shared narrowing filter'
		].map((name) => `preserves valid '${name}' semantics and rejects an invalid variant`)
	},
	{
		id: 'collection-transitions',
		file: corpus + 'collection-projection.test.ts',
		environment: 'compiled source, jsdom mount and full-root hydration',
		tests: ['mount', 'hydrate'].map(
			(mode) => `preserves collection projection contracts through ${mode}`
		)
	},
	{
		id: 'helper-publication',
		file: compiler + 'compilation/helper-state-effects.test.ts',
		environment: 'workspace paired artifacts, jsdom hydration and loopback dispatcher',
		tests: ['inferred', 'explicit', 'remote', 'inline'].map(
			(mode) => `publishes ${mode} helper-driven state updates`
		)
	},
	{
		id: 'derived-types',
		file: compiler + 'native/destructured-derived.test.ts',
		environment: 'native checking/client/server semantic diagnostics',
		tests: [
			'object alias and rest',
			'array default and rest',
			'nested default dependency',
			'computed property',
			'prototype-sensitive name',
			'typed destructuring'
		].map((name) => `preserves ${name} across checking and both executable targets`)
	},
	{
		id: 'derived-purity',
		file: compiler + 'native/destructured-derived.test.ts',
		environment: 'native checking diagnostics',
		tests: ['rejects effectful defaults with an operation-specific diagnostic']
	},
	{
		id: 'helper-authority',
		file: compiler + 'native/helper-effects.test.ts',
		environment: 'native server diagnostics and analysis',
		tests: [
			'branching recursive helper',
			'literal dotted helper path',
			'dynamic helper path',
			'helper collection mutation',
			'opaque helper'
		]
			.map((name) => `rejects remote publication through a '${name}'`)
			.concat([
				'does not grant object mutation effects to scalar arguments of opaque calls',
				'binds only mutable component and parameter arguments while preserving access paths'
			])
	},
	{
		id: 'paired-props',
		file: compiler + 'compilation/destructured-prop-artifacts.test.ts',
		environment: 'workspace paired builds and jsdom hydration',
		tests: ['destructured', 'direct', 'renamed-defaults', 'imported-helper'].map(
			(name) => `preserves ${name} prop semantics across checking, SSR, hydration, and updates`
		)
	},
	{
		id: 'derived-updates',
		file: corpus + 'derived-pattern.test.ts',
		environment: 'compiled source, jsdom mount and full-root hydration',
		tests: ['mount', 'hydrate'].map(
			(mode) => `updates destructured aliases defaults and rest through ${mode}`
		)
	},
	{
		id: 'composition-transitions',
		file: corpus + 'repeated-interactions.test.ts',
		environment: 'compiled source, jsdom mount and full-root hydration',
		tests: ['planned', 'spread', 'enhanced'].flatMap((path) =>
			['mount', 'hydrate'].map(
				(mode) =>
					`${path}/${mode}: adopts or mounts, updates twice, removes handlers and disposes owners`
			)
		)
	},
	{
		id: 'prop-source-identity',
		file: corpus + 'keyed-prop-replacement.test.ts',
		environment: 'compiled source, jsdom mount and full-root hydration',
		tests: ['mount', 'hydrate'].flatMap((mode) =>
			[false, true].map(
				(first) => `${mode}: follows independent props after projected row replacement (${first})`
			)
		)
	},
	{
		id: 'semantic-exploration',
		file: compiler + 'compilation/semantic-equivalence.test.ts',
		environment: 'generated paired artifacts, jsdom mount and hydration',
		tests: ['direct', 'literal', 'computed', 'helper', 'destructured', 'short-circuit'].flatMap(
			(form) =>
				['direct', 'object-assignment', 'array-assignment'].map(
					(write) => `preserves ${form}/${write} evaluation and updates`
				)
		)
	},
	{
		id: 'mutation-type-contracts',
		file: compiler + 'native/mutation-contracts.test.ts',
		environment: 'native checking/client/server semantic diagnostics',
		tests: [
			'array-direct-dot',
			'custom-runtime-push',
			'task-client-direct-context',
			'task-client-direct-result',
			'suspension-client-task-compound',
			'suspension-client-task-logical',
			'suspension-client-task-push',
			'task-signature-client-default',
			'task-signature-client-object-default',
			'task-signature-client-tuple-default',
			'server-optimistic-latest-none',
			'narrow-neighbor-ternary',
			'map-chain-result',
			'set-chain-result',
			'direct destination',
			'nested destination',
			'readonly destination',
			'computed property',
			'required delete',
			'compound constraint',
			'callback context',
			'typed assignment result',
			'suspension-event-destructure-array-rhs',
			'suspension-event-destructure-awaited-rhs',
			'suspension-event-destructure-object-rhs',
			'task-default-before-required'
		].map((name) => `preserves ${name} across checking and executable targets`)
	},
	{
		id: 'task-state-contracts',
		file: compiler + 'compilation/task-state-regressions.test.ts',
		environment: 'paired artifacts, direct SSR and repeated client task execution',
		tests: [
			'native date readers preserve their receiver brand',
			'date reader overrides retain compiled helper selection',
			'custom collection accessor reads pending entries',
			'super collection accessor reads pending membership',
			'super private accessor updates retain results and receiver brands',
			'nested inherited accessor companions retain each home object',
			'captured nested state helper remains pending before success',
			'captured deep state helper remains pending before success',
			'nested helper binding defaults consume pending values',
			'computed helper binding keys consume pending values',
			'destructured helper objects and arguments retain authored identity',
			'borrowed call collection results stay pending',
			'bound native member collection results stay pending',
			'parent then awaited child',
			'child then parent replacement',
			'repeated scalar writes',
			'parent then child prefix',
			'parent then logical child',
			'parent replacement',
			'conditional parent replacement',
			'parent then child',
			'conditional local write',
			'conditional predecessor',
			'uncalled predecessor',
			'assignment RHS predecessor',
			'conditional predecessor replacement',
			'short circuit predecessor',
			'ordered scalar reads',
			'ordered collection reads',
			'ordered nested reads',
			'literal capture',
			'state capture',
			'object capture',
			'tuple capture',
			'dependent capture'
		].map((name) => `preserves '${name}' in direct SSR and client tasks`)
	},
	{
		id: 'mutation-transitions',
		file: corpus + 'mutation-contract.test.ts',
		environment: 'compiled source, jsdom mount and hydration',
		tests: ['mount', 'hydrate'].map(
			(mode) => `preserves authored mutation contracts through ${mode}`
		)
	},
	{
		id: 'accessor-effects',
		file: 'packages/reactive/src/accessor-writes.test.ts',
		environment: 'reactive source accessor writes',
		tests: ['performs repeated accessor assignments without reading the getter']
	},
	{
		id: 'subclass-receivers',
		file: 'packages/reactive/src/subclass-receivers.test.ts',
		environment: 'reactive source native storage, private brands and optimistic undo',
		tests: [
			'preserves private brands, overridden calls and native storage rollback',
			'forwards Array subclass methods and descriptors while observing public fields',
			'observes collection storage changes made by branded accessors and restores ordering',
			'invokes Set overrides on equal additions, absent deletions and empty clears',
			'retains authored Array method identity and permits readonly inspection',
			'keeps objects returned by overridden Map readers observable',
			'observes Array methods without invoking snapshot overrides or losing returned objects',
			'keeps Map and Set public object members and branded getters observable'
		]
	}
];
