/** Compiler-owned invocation operations preserve authored receivers and defer only publication. */
export interface PendingReactiveState {
	/** Adopts a compiler-proven state alias without traversing its untouched object graph. */
	own<Value>(value: Value): Value;
	/** Reads this invocation's pending property or the receiver's committed property. */
	read(target: unknown, key: PropertyKey): unknown;
	/** Selects an inherited property from the companion's original home object, preserving super semantics. */
	superRead(target: object, key: PropertyKey): unknown;
	/** Applies an inherited setter or data assignment to the branded pending receiver. */
	superWrite<Value>(target: object, key: PropertyKey, value: Value): Value;
	/** Captures an assignment value and returns it while publication remains generation-owned. */
	write<Value>(target: object, key: PropertyKey, value: Value): Value;
	/** Applies a native collection operation to pending storage and retains native result identity. */
	call(target: object, key: PropertyKey, args: unknown[]): unknown;
	/** Selects a native operation before its authored arguments are evaluated. */
	method(target: object, key: PropertyKey, selected?: unknown): (...args: unknown[]) => unknown;
	/** Converts a computed key at reference selection, before evaluating an assignment value. */
	key(value: unknown): PropertyKey;
	/** Deletes an owned property in pending storage and returns its native boolean result. */
	remove(target: object, key: PropertyKey): boolean;
	/** Tests membership in pending storage, including inherited properties after a delete. */
	has(target: object, key: PropertyKey): boolean;
	/** Supplies pending iteration only at compiler-owned spread and for-of syntax boundaries. */
	iterable<Value>(target: Value): Value;
	/** Selects a helper companion before evaluating arguments, retaining the public callable and receiver. */
	helper(original: unknown, receiver?: unknown, inline?: boolean): (...args: unknown[]) => unknown;
	/** Preserves nullish optional-call selection before routing a helper through the pending view. */
	optionalHelper(
		original: unknown,
		inline?: boolean
	): ((...args: unknown[]) => unknown) | null | undefined;
	/** Selects an owned member's original callable before argument evaluation and reactive binding. */
	helperMember(
		target: unknown,
		key: PropertyKey,
		inline?: boolean
	): (...args: unknown[]) => unknown;
	/** Restores a native arguments object without the compiler-owned context parameter. */
	arguments(input: IArguments): IArguments;
	/** Supplies native syntax with pending reads. Copy views preserve each property's original identity and select compiled getters on external sources. */
	view<Value>(value: Value, copy?: boolean): Value;
	/** Restores the authored value after an expression uses a pending facade. */
	value<Value>(value: Value): Value;
	/** Fences suspension inside a compiled helper with this invocation's cancellation signal. */
	await<Value>(value: Value | PromiseLike<Value>): Promise<Value>;
	/** Reads a compiler-tokened private field through its original branded receiver. */
	privateRead<Owner extends object, Value>(
		owner: Owner,
		key: object,
		read: (target: Owner) => Value
	): Value;
	/** Stages a compiler-tokened private field without exposing its name or changing its receiver brand. */
	privateWrite<Owner extends object, Value>(
		owner: Owner,
		key: object,
		value: Value,
		write: (target: Owner, value: Value) => void,
		read: (target: Owner) => Value
	): Value;
}

/** An explicit pending view whose journal is committed or discarded by its owner. */
export interface PendingReactiveTransaction extends PendingReactiveState {
	/** Publishes standalone journals synchronously as one rollback-capable reactive batch. Host-ordered journals are published by their host. */
	commit(): void;
	/** Releases unpublished values and rejects subsequent owned writes. Committed storage is unchanged. */
	discard(): void;
	/** Closes mutation capabilities and releases selected paths after the host drains publication. */
	finishPublication(): void;
}
