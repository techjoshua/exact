import { taskStateWitnesses } from './task-state-witnesses.mjs';
import { overlapWitnesses } from './overlap-witnesses.mjs';
import { policyWitnesses } from './policy-witnesses.mjs';
import { taskTypeWitnesses } from './task-type-witnesses.mjs';
import { moduleWitnesses } from './module-witnesses.mjs';
import { factoryWitnesses } from './factory-witnesses.mjs';
import { evaluationWitnesses } from './evaluation-witnesses.mjs';
const compiler = 'packages/compiler/src/';
const corpus = 'packages/component-composition-corpus/src/';

/** Exact behavioral and diagnostic witnesses consumed from fresh execution reports. */
export const witnesses = [
	...overlapWitnesses,
	...policyWitnesses,
	...factoryWitnesses,
	...moduleWitnesses,
	...taskTypeWitnesses,
	...evaluationWitnesses,
	...taskStateWitnesses,
	{
		id: 'task-captured-inputs',
		file: compiler + 'compilation/task-captured-inputs.test.ts',
		environment:
			'owned composition fixture, local mount, local and server hydration, retained props, repeated invocation, selector effects and removal',
		tests: ["'client'/'mount'", "'client'/'hydrate'", "'server'/'hydrate'"].map(
			(mode) => `preserves captured types and selector execution across retained updates (${mode})`
		)
	},
	{
		id: 'enhancement-template-types',
		file: compiler + 'native/enhancement-template-types.test.ts',
		environment:
			'quoted and expression props, paired target lowering, native TypeScript literal constraints',
		tests: ['client', 'server'].flatMap((target) =>
			[
				['bigint', '123456789012345678901234567890'],
				['bigint', '0x10'],
				['bigint', '12n'],
				['number', '0x10'],
				['number', 'NaN'],
				['number', 'Infinity'],
				['Uppercase<string>', 'NAME'],
				['Uppercase<string>', 'Name']
			].map(
				([kind, value]) =>
					`checks quoted and expression ${kind} template props ${JSON.stringify(value)} (${target})`
			)
		)
	},
	{
		id: 'compiler-worker-input-mode',
		file: compiler + 'native/process-input-mode.test.ts',
		environment:
			'real Node child processes, equals/split stdin input modes, runtime flag control and synchronous compiler disposal',
		tests: [
			'equals input mode',
			'split input mode',
			'equals input mode alias',
			'split input mode alias',
			'compatible runtime flags'
		].map((name) => `starts and disposes the compiler worker with '${name}'`)
	},
	{
		id: 'ordinary-helper-inputs',
		file: compiler + 'compilation/task-ordinary-helper-boundary.test.ts',
		environment:
			'authored and compiler-processed ordinary helpers, client/server artifacts, pending discard and publication',
		tests: ['client', 'server'].flatMap((target) => [
			`preserves ordinary helpers and classes without alternate implementations (${target})`,
			`gives original and project helpers the same pending input contract (${target})`,
			`leaves external captures outside component rollback (${target})`
		])
	},
	{
		id: 'helper-view-diagnostics',
		file: compiler + 'native/task-helper-boundaries.test.ts',
		environment:
			'blocking client tasks, ordinary mutation controls, identity/lifetime warnings and bounded acknowledgment',
		tests: [
			...[
				'native identity comparison',
				'retained state closure',
				'fresh callback input',
				'retained input plus fresh parameter',
				'acknowledged retained input',
				'helper acknowledgment',
				'call acknowledgment',
				'unrelated body annotation',
				'purity annotation',
				'explicit storage identity',
				'ordinary input mutation',
				'scalar comparison'
			].map((name) => `checks pending helper limits for '${name}'`),
			...[
				'this.state.counter.read',
				'this.state.counter["read"]',
				'this.state.counter.field',
				'this.state.counter["field"]',
				'service.read',
				'service["read"]',
				'service.field',
				'service["field"]'
			].map((receiver) => `preserves the class receiver boundary for ${receiver}`)
		]
	},
	{
		id: 'helper-state-bridges',
		file: 'packages/reactive/src/state-access.test.ts',
		environment:
			'ordinary private-branded helper, explicit capabilities, readonly/lifetime enforcement and production bundle elimination',
		tests: [
			'lets an ordinary branded helper use explicit state access without transforming the helper',
			'preserves readonly policy and leaves ordinary storage outside a transaction',
			'compares storage identity explicitly without changing native equality',
			'rejects owned class methods before effects and permits the same class as an ordinary helper',
			...['prototype', 'selected'].map(
				(form) => `binds an owned ${form} collection method to the creating invocation`
			),
			'eliminates unused bridges from production bundles independently'
		]
	},
	{
		id: 'task-repeated-captures',
		file: compiler + 'compilation/task-repeated-captures.test.ts',
		environment:
			'typed activation snapshots, repeated and distinct props, aliases, computed reads and lexical shadow controls, composed server dispatch',
		tests: ['client', 'server'].flatMap((target) =>
			['same', 'indexed', 'alias', 'different', 'computed', 'shadow'].map(
				(form) => `retains repeated ${form} captures across task callbacks and fetch (${target})`
			)
		)
	},
	{
		id: 'helper-jsx-completion',
		file: compiler + 'compilation/task-helper-jsx.test.ts',
		environment:
			'client DOM and server rendering through ordinary component-support helper providers',
		tests: ['method', 'getter', 'parameter'].flatMap((form) =>
			['client', 'server'].map(
				(target) => `renders ${form} JSX through ordinary component-support helpers (${target})`
			)
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
			'published external asynchronous helper',
			'packaged external synchronous helper',
			'packaged external asynchronous helper',
			'packaged external CommonJS synchronous helper',
			'packaged external CommonJS asynchronous helper'
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
			'standalone reactive transactions, native receiver limits and pending collection lifetime',
		tests: [
			...['plain', 'reactive'].flatMap((writer) =>
				['writer-first', 'reader-first'].map(
					(order) => `preserves ${writer} writer policy with ${order} readonly aliases`
				)
			),
			...['commit', 'discard'].map(
				(settle) => `fences retained reads and helper effects after ${settle}`
			),
			'preserves native Date brands through direct, borrowed and unchanged helper readers',
			'rejects owned Date timestamp mutation before effects and permits value replacement',
			'isolates overlapping pending views across suspension and publishes one coherent transition',
			'supplies unchanged helpers with shared pending property and collection semantics',
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
		id: 'helper-call-selection',
		file: corpus + 'helper-call-selection.test.ts',
		environment: 'compiled source, jsdom mount and full-root hydration with pending publication',
		tests: ['mount', 'hydrate'].flatMap((mode) =>
			['alias', 'shadow', 'extracted', 'higher-order'].map(
				(form) => `preserves ${form} helper selection through ${mode}`
			)
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
			'contextual-returned-helper',
			'contextual-callable-field',
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
