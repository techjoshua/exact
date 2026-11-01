/** Independent provider identity used only to describe an admission failure. */
type InputProvider = Readonly<{ version: number; target: 'client' | 'server' }>;
const incompatibleTag = Symbol.for('@exactjs/component-input-incompatibility');
const contractVersionTag = Symbol.for('@exactjs/component-contract-version-mismatch');

/** Cross-copy protocol failure retained through nested adoption fallback catches. */
export type ExactComponentInputIncompatibility = Error &
	Readonly<{
		code: 'EXACT_COMPONENT_INPUT_INCOMPATIBLE';
		expectedVersion: number;
		actualVersion: number | undefined;
		expectedTarget: 'client' | 'server';
		actualTarget: 'client' | 'server' | undefined;
	}>;

/** Recognizes own data facts without local class identity, message matching or accessor reads. */
export function isComponentInputIncompatibility(
	value: unknown
): value is ExactComponentInputIncompatibility {
	if (typeof value !== 'object' || value === null) return false;
	return (
		Object.getOwnPropertyDescriptor(value, incompatibleTag)?.value === true &&
		Object.getOwnPropertyDescriptor(value, 'code')?.value === 'EXACT_COMPONENT_INPUT_INCOMPATIBLE'
	);
}

/** Rejects before component input effects with the consuming provider's independent identity. */
export function rejectComponentInput(
	provider: InputProvider,
	actualVersion?: number,
	actualTarget?: 'client' | 'server'
): never {
	const error = Object.assign(
		new TypeError(
			'Incompatible eXact component inputs. Rebuild matching compiler, core, DOM and SSR providers.'
		),
		{
			code: 'EXACT_COMPONENT_INPUT_INCOMPATIBLE' as const,
			expectedVersion: provider.version,
			actualVersion,
			expectedTarget: provider.target,
			actualTarget
		}
	);
	Object.defineProperty(error, incompatibleTag, { value: true });
	throw error;
}

/** Marks only a metadata generation failure, preserving ordinary authored exception identities. */
export function componentContractVersionMismatch(actual: unknown, expected: number): TypeError {
	const display =
		typeof actual === 'number' || typeof actual === 'string' ? String(actual) : '<invalid>';
	const error = new TypeError(
		`Unsupported eXact component artifact version ${display}; expected ${expected}. Recompile with the matching eXact compiler.`
	);
	Object.defineProperties(error, {
		[contractVersionTag]: { value: expected },
		actualVersion: { value: typeof actual === 'number' ? actual : undefined }
	});
	return error;
}

/** Translates metadata mismatch only at an actual consumer, never inferring its target from input. */
export function rethrowComponentInputFailure(error: unknown, provider: InputProvider): never {
	if (
		typeof error === 'object' &&
		error !== null &&
		Object.getOwnPropertyDescriptor(error, contractVersionTag)?.value === provider.version
	) {
		const actual = Object.getOwnPropertyDescriptor(error, 'actualVersion')?.value;
		rejectComponentInput(provider, typeof actual === 'number' ? actual : undefined);
	}
	throw error;
}
