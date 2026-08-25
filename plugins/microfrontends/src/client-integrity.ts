const remoteLoaderSymbol = Symbol.for('@exactjs/microfrontends/remote-loader');

type IntegrityLoaderHost = typeof globalThis & {
	[remoteLoaderSymbol]?: ExactRemoteIntegrityLoader;
};

type ExactRemoteIntegrityLoader = Readonly<{
	load(url: string, integrity: string, signal: AbortSignal): Promise<unknown>;
	publish(token: string | null, value: unknown): void;
}>;

/** Loads one remote module through the shared browser integrity loader. */
export function importIntegrityPinnedRemoteModule(
	url: string,
	integrity: string,
	signal: AbortSignal
): Promise<unknown> {
	return exactRemoteIntegrityLoader().load(url, integrity, signal);
}

/** Creates or reuses the page-owned loader that settles integrity-pinned module scripts. */
function exactRemoteIntegrityLoader(): ExactRemoteIntegrityLoader {
	const host = globalThis as IntegrityLoaderHost;
	if (host[remoteLoaderSymbol]) return host[remoteLoaderSymbol];
	let sequence = 0;
	const pending = new Map<
		string,
		Readonly<{
			resolve(value: unknown): void;
			reject(error: Error): void;
			script: HTMLScriptElement;
			cleanup(): void;
		}>
	>();
	const loader: ExactRemoteIntegrityLoader = Object.freeze({
		load(url, integrity, signal) {
			if (typeof document === 'undefined')
				return Promise.reject(
					new Error('Integrity-pinned remote loading requires a browser document')
				);
			const token = `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
			const source = new URL(url, document.baseURI);
			source.searchParams.set('__exact_module_token', token);
			const script = document.createElement('script');
			script.type = 'module';
			script.src = source.href;
			script.integrity = integrity;
			if (source.origin !== document.location.origin) script.crossOrigin = 'anonymous';
			return new Promise((resolve, reject) => {
				const fail = () =>
					settleRemoteLoad(
						token,
						pending,
						new Error('Remote client entry failed integrity-checked loading')
					);
				const abort = () =>
					settleRemoteLoad(
						token,
						pending,
						signal.reason instanceof Error
							? signal.reason
							: new Error('Remote client entry loading aborted')
					);
				pending.set(token, {
					resolve,
					reject,
					script,
					cleanup: () => signal.removeEventListener('abort', abort)
				});
				signal.addEventListener('abort', abort, { once: true });
				script.addEventListener('error', fail, { once: true });
				script.addEventListener('load', () => pending.has(token) && fail(), { once: true });
				document.head.append(script);
				if (signal.aborted) abort();
			});
		},
		publish(token, value) {
			if (!token) return;
			const entry = pending.get(token);
			if (!entry) return;
			pending.delete(token);
			entry.cleanup();
			entry.script.remove();
			entry.resolve(value);
		}
	});
	host[remoteLoaderSymbol] = loader;
	return loader;
}

/** Rejects one pending script load and releases its browser resources. */
function settleRemoteLoad(
	token: string,
	pending: Map<
		string,
		Readonly<{ reject(error: Error): void; script: HTMLScriptElement; cleanup(): void }>
	>,
	error: Error
): void {
	const entry = pending.get(token);
	if (!entry) return;
	pending.delete(token);
	entry.cleanup();
	entry.script.remove();
	entry.reject(error);
}
