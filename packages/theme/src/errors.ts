/** A validation failure that leaves the previously published theme untouched. */
export class ThemeResolutionError extends Error {
	readonly code:
		| 'invalid-color'
		| 'invalid-source'
		| 'invalid-temperament'
		| 'invalid-typography'
		| 'invalid-override';
	readonly path: string;

	/** Creates a path-specific public theme diagnostic. */
	constructor(code: ThemeResolutionError['code'], path: string, message: string) {
		super(message);
		this.name = 'ThemeResolutionError';
		this.code = code;
		this.path = path;
	}
}
