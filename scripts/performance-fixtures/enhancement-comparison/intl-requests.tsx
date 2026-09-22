import { performance } from 'node:perf_hooks';
import { renderToString } from '@exactjs/ssr';
import {
	createIntlEnvironment,
	defineIntlLocale,
	IntlMessage,
	IntlProvider,
	type IntlEnvironment,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { prepareIntlActivation } from '@exactjs/intl/internal';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'intl-request-benchmark',
	occurrenceId: 'Message:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'fallback' }],
	capabilities: []
};
const requests = [
	{ locale: defineIntlLocale('fr-CA'), catalogLocale: 'fr', text: 'bonjour-a' },
	{ locale: defineIntlLocale('de-DE'), catalogLocale: 'de', text: 'hallo-b' },
	{ locale: defineIntlLocale('fr-CA'), catalogLocale: 'fr', text: 'bonjour-c' },
	{ locale: defineIntlLocale('zh-Hant-TW-u-nu-latn'), catalogLocale: 'zh-Hant', text: 'message-d' }
];

function environmentFor(request: (typeof requests)[number]): IntlEnvironment {
	return createIntlEnvironment({
		locale: request.locale,
		descriptors: [descriptor],
		catalogs: [
			{
				protocol: 1,
				owner: descriptor.owner,
				locale: request.catalogLocale,
				messages: { [descriptor.key]: [{ kind: 'text', value: request.text }] }
			}
		]
	});
}

const reused = requests.map(environmentFor);

function Messages(props: { count: number }) {
	return () => (
		<section>
			{Array.from({ length: props.count }, (_, key) => (
				<IntlMessage key={key} message={prepareIntlActivation(descriptor, [])} />
			))}
		</section>
	);
}

/** Measures SSR with isolated catalogs, including environment construction in fresh modes. */
export async function measureIntlRequests(
	mode: 'fresh-same' | 'fresh-mixed' | 'reused-same' | 'reused-mixed',
	count: number
) {
	const selected = mode.endsWith('mixed') ? requests : requests.slice(0, 1);
	const start = performance.now();
	const results = await Promise.all(
		selected.map((request, index) => {
			const environment = mode.startsWith('fresh') ? environmentFor(request) : reused[index]!;
			return renderToString(
				<IntlProvider environment={environment}>
					<Messages count={count} />
				</IntlProvider>
			);
		})
	);
	const perRequestMs = (performance.now() - start) / selected.length;
	for (let index = 0; index < results.length; index++) {
		const text = results[index]!.html.replace(/<!--[^]*?-->|<[^>]*>/g, '');
		if (text !== selected[index]!.text.repeat(count))
			throw new Error('Cross-request Intl output mismatch');
	}
	return { perRequestMs, html: results.map((result) => result.html) };
}
