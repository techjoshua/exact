/** Normalized native residency and secrecy contract. */
export type NativeCompilerDataPolicy = Readonly<{
	residency: 'server' | 'client' | 'shared';
	secret: boolean;
}>;

/** One declaration, state path, context, parameter, or return governed by policy. */
export type NativeCompilerPolicySubject = Readonly<{
	id: string;
	kind: 'declaration' | 'field' | 'parameter' | 'return' | 'state' | 'context';
	name: string;
	path?: string;
	componentId?: string;
	callableId?: string;
	parameterIndex?: number;
	policy: NativeCompilerDataPolicy;
	source: 'annotation' | 'context-option' | 'inference' | 'import';
}>;

/** One checked propagation or transfer in the native policy graph. */
export type NativeCompilerPolicyFlow = Readonly<{
	id: string;
	kind: 'propagation' | 'receipt' | 'projection' | 'transfer';
	from: readonly string[];
	to: string;
	policy: NativeCompilerDataPolicy;
	boundary?:
		| 'client-island'
		| 'hydration'
		| 'context'
		| 'call'
		| 'state'
		| 'operation'
		| 'error'
		| 'log';
	authorized: boolean;
	reason?: string;
}>;

/** One audited boundary which intentionally removes secret qualification. */
export type NativeCompilerSecretConsumer = Readonly<{
	id: string;
	selector?: string;
	dynamic: boolean;
	source: string;
	line: number;
	column: number;
	caller: string;
	consumer: Readonly<{
		package: string;
		symbol: string;
		parameter: number;
	}>;
	target: 'server' | 'client';
	authorization: 'implicit-application-owner' | 'library-requirement' | 'denied';
	reason?: string;
}>;

/** Session-local policy graph emitted by the native compiler. */
export type NativeCompilerPolicyAnalysis = Readonly<{
	version: 1;
	subjects: readonly NativeCompilerPolicySubject[];
	flows: readonly NativeCompilerPolicyFlow[];
	secretConsumers: readonly NativeCompilerSecretConsumer[];
}>;
