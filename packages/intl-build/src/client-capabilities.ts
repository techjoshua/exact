import type { IntlClientRequirement } from '@exactjs/intl';

/** One generator-owned implementation policy for a finite intl client capability. */
export type IntlClientCapabilityProvider =
	| Readonly<{ kind: 'native' }>
	| Readonly<{ kind: 'module'; specifier: string }>
	| Readonly<{
			kind: 'cdn';
			url: string;
			integrity: string;
			crossOrigin?: 'anonymous' | 'use-credentials';
	  }>;

/** Emits pre-evaluation provider code for one artifact's finite client requirements. */
export function createIntlClientCapabilityBootstrap(
	requirements: readonly IntlClientRequirement[],
	providers:
		| Readonly<Partial<Record<IntlClientRequirement, IntlClientCapabilityProvider>>>
		| undefined,
	target: 'client' | 'server'
): string {
	if (target === 'server' || requirements.length === 0) return '';
	const declarations: string[] = [];
	for (const requirement of [...new Set(requirements)].sort()) {
		const provider = providers?.[requirement];
		if (!provider || provider.kind === 'native') continue;
		if (provider.kind === 'module') {
			if (!validModuleSpecifier(provider.specifier))
				throw new TypeError(`Intl capability ${requirement} has an invalid module specifier`);
			declarations.push(`import ${JSON.stringify(provider.specifier)};`);
			continue;
		}
		const url = new URL(provider.url);
		if (
			url.protocol !== 'https:' ||
			!/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/u.test(provider.integrity)
		)
			throw new TypeError(`Intl capability ${requirement} requires a pinned HTTPS CDN provider`);
		const identity = `@exactjs/intl-capability:${requirement}:${url.href}:${provider.integrity}`;
		declarations.push(`await (() => {
	const key = Symbol.for(${JSON.stringify(identity)});
	const root = globalThis;
	const existing = root[key];
	if (existing) return existing;
	const pending = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = ${JSON.stringify(url.href)};
		script.integrity = ${JSON.stringify(provider.integrity)};
		script.crossOrigin = ${JSON.stringify(provider.crossOrigin ?? 'anonymous')};
		script.onload = () => resolve(undefined);
		script.onerror = () => reject(new Error(${JSON.stringify(`Unable to load intl capability ${requirement}`)}));
		document.head.append(script);
	});
	root[key] = pending;
	return pending;
})();`);
	}
	return declarations.length ? `${declarations.join('\n')}\n` : '';
}

function validModuleSpecifier(value: string): boolean {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= 1024 &&
		!value.includes('\0') &&
		!/^https?:/iu.test(value)
	);
}
