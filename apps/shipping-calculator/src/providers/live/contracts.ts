export type Json = Record<string, any>;
export type Token = { value: string; expiresAt: number };

export class ProviderHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly retryAfterSeconds?: number
	) {
		super(message);
	}
}
