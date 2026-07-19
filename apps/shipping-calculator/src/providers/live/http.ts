import { ProviderHttpError, type Json, type Token } from './contracts.js';

const tokens = new Map<string, Token>();

export function bearer(token: string): Record<string, string> {
	return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export async function oauthJson(
	key: string,
	url: string,
	clientId: string,
	clientSecret: string,
	context: { signal: AbortSignal; fetch: typeof fetch }
): Promise<string> {
	return token(key, async () =>
		requestJson(
			url,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					client_id: clientId,
					client_secret: clientSecret,
					grant_type: 'client_credentials'
				}),
				signal: context.signal
			},
			context.fetch
		)
	);
}
export async function oauthForm(
	key: string,
	url: string,
	clientId: string,
	clientSecret: string,
	context: { signal: AbortSignal; fetch: typeof fetch }
): Promise<string> {
	return token(key, async () =>
		requestJson(
			url,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
				},
				body: 'grant_type=client_credentials',
				signal: context.signal
			},
			context.fetch
		)
	);
}
export async function oauthFedex(
	key: string,
	url: string,
	clientId: string,
	clientSecret: string,
	context: { signal: AbortSignal; fetch: typeof fetch }
): Promise<string> {
	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: clientId,
		client_secret: clientSecret
	});
	return token(key, async () =>
		requestJson(
			url,
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body,
				signal: context.signal
			},
			context.fetch
		)
	);
}
export async function token(key: string, load: () => Promise<Json>): Promise<string> {
	const existing = tokens.get(key);
	if (existing && existing.expiresAt > Date.now() + 30_000) return existing.value;
	const body = await load();
	const value = String(body.access_token ?? body.accessToken ?? '');
	if (!value) throw new ProviderHttpError(401, 'Carrier authentication failed');
	tokens.set(key, {
		value,
		expiresAt: Date.now() + Number(body.expires_in ?? body.expiresIn ?? 3_600) * 1000
	});
	return value;
}

export async function requestJson(
	url: string,
	init: RequestInit,
	fetchImpl: typeof fetch
): Promise<Json> {
	const response = await fetchImpl(url, init);
	if (!response.ok)
		throw new ProviderHttpError(
			response.status,
			`Carrier returned HTTP ${response.status}`,
			Number(response.headers.get('retry-after')) || undefined
		);
	return (await response.json()) as Json;
}
