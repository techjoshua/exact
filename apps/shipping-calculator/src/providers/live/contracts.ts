/** Defines the json type contract. */
export type Json = Record<string, any>;
/** Defines the token type contract. */
export type Token = { value: string; expiresAt: number };

/** Represents a failure raised by provider http. */
export class ProviderHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly retryAfterSeconds?: number
	) {
		super(message);
	}
}
