/** Defines recursively transportable JSON property data. */
export type JsonValue = null | boolean | number | string | JsonValue[] | Json;
/** Defines a decoded provider response object. */
export type Json = { [key: string]: JsonValue };
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
