/** Preserves explicit JavaScript descriptor rules, independently of TypeScript readonly. */
export function verifyNativeDescriptorAcceptance({ reactive, reactiveObjects, writeReactiveLazy }) {
	for (const wrap of [reactive, reactiveObjects]) {
		for (const [create, key] of [
			[() => ({ count: 1 }), 'count'],
			[() => [1], '0'],
			[() => [1], 'length']
		]) {
			for (const writable of [false, true]) {
				const raw = create();
				Object.defineProperty(raw, key, { writable });
				const view = wrap(raw);
				if (Reflect.set(view, key, 1) !== writable)
					throw new Error('Equal assignment bypassed native descriptor acceptance');
				let rejected = false;
				try {
					writeReactiveLazy(view, [key], () => 1);
				} catch (error) {
					if (!(error instanceof TypeError)) throw error;
					rejected = true;
				}
				if (rejected === writable)
					throw new Error('Compiler assignment changed native descriptor acceptance');
				if (Reflect.set(view, key, 2) !== writable || view[key] !== (writable ? 2 : 1))
					throw new Error('Changed assignment lost native descriptor semantics');
				if (!Reflect.defineProperty(view, key, Object.getOwnPropertyDescriptor(raw, key)))
					throw new Error('An unchanged native descriptor was rejected');
			}
		}
	}
	for (const wrap of [reactive, reactiveObjects]) {
		const state = wrap({ count: 1 });
		const child = Object.create(state);
		const blocked = Object.create(state);
		Object.defineProperty(blocked, 'count', { value: 1, writable: false });
		if (
			!Reflect.set(state, 'count', 1, child) ||
			!Object.hasOwn(child, 'count') ||
			Reflect.set(state, 'count', 1, blocked) ||
			state.count !== 1
		)
			throw new Error('Equal assignment ignored its actual receiver');
	}
	for (const wrap of [reactive, reactiveObjects])
		verifyArrayLengthReplacement(
			(items) => wrap({ items }),
			(state, next) => writeReactiveLazy(state, ['items'], () => next)
		);
	for (const create of [() => new Map(), () => new Set()]) {
		const raw = create();
		Object.defineProperty(raw, 'count', { value: 1, writable: false });
		if (Reflect.set(reactive(raw), 'count', 1))
			throw new Error('Collection public property bypassed native descriptor acceptance');
	}
}

/** Checks native acceptance before indexed membership, publication, and rollback bookkeeping. */
export function verifyIndexedDescriptorAcceptance({
	indexedReactive,
	readReactiveOwnProperty,
	writeIndexedReactiveValue,
	deleteIndexedReactiveValue,
	readIndexedReactiveSource,
	watch,
	flushSync,
	batch
}) {
	verifyArrayLengthReplacement(
		(items) => {
			const state = indexedReactive(['items']);
			state.items = items;
			return state;
		},
		(state, next) => writeIndexedReactiveValue(state, 0, next)
	);
	const create = () => {
		const state = indexedReactive(['count', 'other']);
		state.count = 1;
		state.other = 0;
		return state;
	};
	for (const configurable of [false, true])
		for (const writable of [false, true]) {
			const state = create();
			Object.defineProperty(state, 'count', { writable, configurable });
			for (const next of [1, 2]) {
				if (Reflect.set(state, 'count', next) !== writable || state.count !== (writable ? next : 1))
					throw new Error('Indexed assignment changed native descriptor acceptance');
			}
			let rejected = false;
			try {
				writeIndexedReactiveValue(state, 0, 1);
			} catch (error) {
				if (!(error instanceof TypeError)) throw error;
				rejected = true;
			}
			if (rejected === writable)
				throw new Error('Strict indexed assignment bypassed native constraints');
		}
	{
		const state = create();
		Object.seal(state);
		if (Reflect.deleteProperty(state, 'count') || !readReactiveOwnProperty(state, 'count').present)
			throw new Error('Failed indexed deletion changed own-field bookkeeping');
		let rejected = false;
		try {
			deleteIndexedReactiveValue(state, 0);
		} catch (error) {
			if (!(error instanceof TypeError)) throw error;
			rejected = true;
		}
		if (!rejected) throw new Error('Strict indexed deletion accepted a nonconfigurable field');
		try {
			batch(() => {
				state.count = 2;
				throw new Error('rollback');
			});
		} catch (error) {
			if (error.message !== 'rollback') throw error;
		}
		if (state.count !== 1 || Object.getOwnPropertyDescriptor(state, 'count').configurable)
			throw new Error('Indexed rollback lost a native descriptor');
	}
	{
		const state = create();
		Object.preventExtensions(state);
		if (Reflect.set(state, 'missing', 2) || 'missing' in state || Object.hasOwn(state, 'missing'))
			throw new Error('Failed indexed creation published phantom membership');
	}
	{
		const state = create();
		let gets = 0,
			sets = 0,
			observations = 0;
		Object.defineProperty(state, 'count', {
			configurable: true,
			get() {
				gets++;
				return this.other;
			},
			set(value) {
				sets++;
				this.other = value;
			}
		});
		const stop = watch(() => {
			state.other;
			observations++;
		});
		try {
			writeIndexedReactiveValue(state, 0, 2);
			flushSync();
			if (gets || sets !== 1 || observations !== 2 || state.count !== 2)
				throw new Error(
					'Indexed accessor assignment lost its native receiver or invoked its getter'
				);
			if (
				readReactiveOwnProperty(state, 'count').present ||
				readIndexedReactiveSource(state, 0).present ||
				gets !== 1
			)
				throw new Error('Indexed data-only inspection evaluated a getter');
		} finally {
			stop();
		}
	}
	{
		const state = indexedReactive(['box']);
		state.box = { value: 1 };
		Object.defineProperty(state, 'box', { writable: false });
		let rejected = false;
		try {
			writeIndexedReactiveValue(state, 0, { value: 2 });
		} catch (error) {
			if (!(error instanceof TypeError)) throw error;
			rejected = true;
		}
		if (!rejected || state.box.value !== 1)
			throw new Error('Reconciliation bypassed native destination constraints');
		state.box.value = 3;
		if (state.box.value !== 3) throw new Error('Native data descriptors became deep immutability');
	}
	{
		const state = indexedReactive(['box']);
		const child = { value: 1 };
		Object.defineProperty(state, 'box', { value: child, writable: false, configurable: false });
		if (state.box !== child) throw new Error('Indexed reads violated native frozen-value identity');
		child.value = 2;
		if (state.box.value !== 2) throw new Error('Native child aliases lost ordinary mutability');
	}
}

/** Exercises synchronization separately from assignment so valid matches and nested merges remain legal. */
export function verifyReconciliationNativeAcceptance({
	reactive,
	reactiveObjects,
	indexedReactive,
	indexedReactiveObjects,
	updateReactive,
	updateReactiveShallow
}) {
	const createIndexed = (create) => (initial) => {
		const state = create(Object.keys(initial));
		Object.assign(state, initial);
		return state;
	};
	for (const make of [
		reactive,
		reactiveObjects,
		createIndexed(indexedReactive),
		createIndexed(indexedReactiveObjects)
	]) {
		for (const update of [updateReactive, updateReactiveShallow]) {
			const state = make({ count: 1 });
			Object.defineProperty(state, 'count', { writable: false });
			expectNativeRejection(() => update(state, { count: 2 }));
			update(state, { count: 1 });
			if (state.count !== 1) throw new Error('Synchronization changed a non-writable field');
			const sealed = Object.seal(make({ count: 1 }));
			expectNativeRejection(() => update(sealed, {}));
			update(sealed, { count: 2 });
			if (sealed.count !== 2) throw new Error('Synchronization rejected a sealed writable field');
			const empty = make({});
			update(empty, { count: undefined });
			if (!Object.hasOwn(empty, 'count'))
				throw new Error('Synchronization omitted undefined creation');
			const blocked = Object.preventExtensions(make({}));
			expectNativeRejection(() => update(blocked, { count: undefined }));
			if ('count' in blocked)
				throw new Error('Rejected synchronization created phantom membership');
			const ordered = make({ a: 1, b: 1 });
			Object.defineProperty(ordered, 'b', { writable: false });
			expectNativeRejection(() => update(ordered, { a: 2, b: 2 }));
			if (ordered.a !== 1 || ordered.b !== 1)
				throw new Error('Rejected synchronization lost rollback');
			const accessor = make({ count: 1, other: 0 });
			let gets = 0,
				sets = 0;
			Object.defineProperty(accessor, 'count', {
				configurable: true,
				get() {
					gets++;
					return this.other;
				},
				set(next) {
					sets++;
					this.other = next;
				}
			});
			update(accessor, { other: 0, count: 2 });
			if (gets || sets !== 1 || accessor.other !== 2)
				throw new Error('Synchronization lost native setter behavior');
		}
		const state = make({ box: { count: 1 } });
		const retained = state.box;
		Object.defineProperty(state, 'box', { writable: false });
		updateReactive(state, { box: { count: 2 } });
		if (state.box !== retained || retained.count !== 2)
			throw new Error('Synchronization rejected a mutable child merge');
		expectNativeRejection(() => updateReactiveShallow(state, { box: { count: 3 } }));
		if (retained.count !== 2) throw new Error('Shallow synchronization mutated a retained child');
	}
}

/** A fixed array length restricts its own resizing, while its owner can still accept a replacement. */
function verifyArrayLengthReplacement(make, write) {
	for (const next of [[1], [2], [1, 2], []]) {
		const state = make([1]);
		const retained = state.items;
		Object.defineProperty(retained, 'length', { writable: false });
		write(state, next);
		if (JSON.stringify(state.items) !== JSON.stringify(next))
			throw new Error('Array assignment lost a valid replacement');
		if (state.items === retained || retained[0] !== 1)
			throw new Error('Array assignment mutated previous storage');
	}
}

/** Strict framework mutations surface failed native operations without changing valid controls. */
function expectNativeRejection(work) {
	try {
		work();
	} catch (error) {
		if (error instanceof TypeError) return;
		throw error;
	}
	throw new Error('Synchronization ignored a failed native mutation');
}

/** Preserves reflected values, membership and enumeration through retained updates and cleanup. */
export function verifyReactiveReflection({
	reactive,
	reactiveObjects,
	indexedReactive,
	indexedReactiveObjects,
	watch,
	flushSync,
	batch
}) {
	const indexed = (create) => (options) => {
		const state = create(['count'], options);
		state.count = 1;
		return state;
	};
	for (const make of [
		(options) => reactive({ count: 1 }, options),
		(options) => reactiveObjects({ count: 1 }, options),
		indexed(indexedReactive),
		indexed(indexedReactiveObjects)
	]) {
		const mutations = [];
		const state = make({ onMutation: (key, operation) => mutations.push([key, operation]) });
		const values = [],
			reads = [],
			membership = [],
			keys = [];
		const stops = [
			watch(() => values.push(state.count)),
			watch(() => reads.push(state.added)),
			watch(() => membership.push('added' in state)),
			watch(() => keys.push(Object.keys(state).join(',')))
		];
		try {
			mutations.length = 0;
			Object.defineProperty(state, 'count', { value: 2 });
			flushSync();
			if (JSON.stringify(values) !== '[1,2]')
				throw new Error('A reflected value change failed to notify its reader');
			state.added = undefined;
			flushSync();
			delete state.added;
			flushSync();
			if (reads.length !== 3 || JSON.stringify(membership) !== '[false,true,false]')
				throw new Error('Dynamic membership or missing reads failed to update');
			Object.defineProperty(state, 'count', { enumerable: false });
			flushSync();
			Object.defineProperty(state, 'count', { enumerable: true });
			flushSync();
			if (JSON.stringify(keys) !== JSON.stringify(['count', 'count,added', 'count', '', 'count']))
				throw new Error('Enumeration missed a structural or descriptor change');
			if (
				JSON.stringify(mutations) !==
				JSON.stringify([
					['count', 'define'],
					['added', 'set'],
					['added', 'delete'],
					['count', 'define'],
					['count', 'define']
				])
			)
				throw new Error('Successful reflection lost mutation observation');
			try {
				batch(() => {
					Object.defineProperty(state, 'count', { value: 3 });
					throw new Error('rollback');
				});
			} catch (error) {
				if (error.message !== 'rollback') throw error;
			}
			flushSync();
			if (state.count !== 2) throw new Error('Reflected value rollback lost native storage');
		} finally {
			for (const stop of stops) stop();
		}
		const lengths = [values.length, reads.length, membership.length, keys.length];
		state.count = 4;
		state.added = 1;
		flushSync();
		if (
			JSON.stringify(lengths) !==
			JSON.stringify([values.length, reads.length, membership.length, keys.length])
		)
			throw new Error('Disposed reflection readers were retained');
		const fixed = make();
		const reference = reactive({ value: 1 });
		if (!Reflect.defineProperty(fixed, 'fixed', { value: reference }) || fixed.fixed !== reference)
			throw new Error('Fixed native definition changed its exact proxy value');
		const descriptor = Object.getOwnPropertyDescriptor(fixed, 'fixed');
		if (
			!Reflect.defineProperty(fixed, 'fixed', descriptor) ||
			Reflect.defineProperty(fixed, 'fixed', { ...descriptor, value: { value: 1 } })
		)
			throw new Error('Native descriptor equality used structural value equality');
		const freezing = make();
		if (
			!Reflect.defineProperty(freezing, 'count', {
				value: reference,
				configurable: false,
				writable: false
			}) ||
			freezing.count !== reference
		)
			throw new Error('A native fixed-value transition changed its supplied reference');
		const events = [];
		const blocked = make({ onMutation: (...args) => events.push(args) });
		Object.freeze(blocked);
		events.length = 0;
		if (
			Reflect.defineProperty(blocked, 'count', { value: 5 }) ||
			Reflect.defineProperty(blocked, 'added', { value: 1 }) ||
			events.length
		)
			throw new Error('Rejected reflection published a mutation');
	}
}

/** Native and raw custom Array methods must reconnect field readers after equal-shaped replacement. */
export function verifyCustomArrayReferenceReplacement({
	reactive,
	reactiveObjects,
	watch,
	flushSync
}) {
	class Values extends Array {
		box = { count: 1 };
		replace() {
			this.box = { count: 1 };
		}
	}
	for (const wrap of [reactive, reactiveObjects])
		for (const method of ['custom', 'fill', 'splice']) {
			const state = wrap(method === 'custom' ? new Values() : [{ count: 1 }]);
			const read = () => (method === 'custom' ? state.box : state[0]);
			const previous = read();
			const seen = [];
			const stop = watch(() => seen.push(read().count));
			try {
				if (method === 'custom') state.replace();
				else if (method === 'fill') state.fill({ count: 1 });
				else state.splice(0, 1, { count: 1 });
				flushSync();
				if (read() === previous) throw new Error('Native replacement retained its old reference');
				read().count = 2;
				flushSync();
				if (seen.at(-1) !== 2)
					throw new Error('Native replacement left field readers on the old reference');
				const length = seen.length;
				previous.count = 3;
				flushSync();
				if (seen.length !== length)
					throw new Error('A superseded reference retained its field reader');
			} finally {
				stop();
			}
			const length = seen.length;
			read().count = 4;
			flushSync();
			if (seen.length !== length) throw new Error('A disposed native property reader was retained');
		}
}
