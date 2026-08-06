import { JSDOM } from 'jsdom';
import {
	Fragment,
	createServerBoundary,
	createVNode,
	markFiniteClientBoundary
} from '../../packages/core/dist/index.js';
import { renderToHydratableString } from '../../packages/ssr/dist/index.js';
import {
	progressiveHtmlChunk,
	scopedReplacementScript
} from '../../packages/ssr/dist/stream/protocol.js';
import { elapsed, payloadBytes } from './foundation-measurement.mjs';

/** Compares the production self-describing and compact hydration publication paths. */
export function measureHydrationPublication() {
	const count = 200;
	const records = Array.from({ length: count }, (_, index) => ({
		id: `boundary-${index}`,
		name: index % 2 ? 'EditableRow' : 'SelectableRow',
		props: { index, label: `Parcel ${index}`, selected: index % 3 === 0 }
	}));
	const attributed = renderBoundaries(records, false);
	const indexed = renderBoundaries(records, true);
	const attributedParse = elapsed(() => parseAttributedBoundaries(attributed));
	const indexedParse = elapsed(() => parseIndexedBoundaries(indexed));
	if (attributedParse.value.length !== count || indexedParse.value.length !== count)
		throw new Error('hydration publication lost a boundary record');
	const progressive = progressivePayloads(32);
	const applicationPayload = JSON.stringify(records);
	const attributedFramework = `${'<div data-exact-client-boundary="" data-exact-client-name="" data-exact-client-props=""></div>'.repeat(count)}<script type="application/json" id="__exact_hydration">{}</script>`;
	const indexedCoordinates = records
		.map(
			(_record, index) =>
				`<div data-xh="${(index % 2).toString(36)}.${Math.floor(index / 2).toString(36)}"></div>`
		)
		.join('');
	const indexedFramework = `${indexedCoordinates}<script type="application/json" id="__exact_hydration">{"h":[1,[]]}</script>`;
	const inlineExecution = elapsed(() => executeProgressivePayload(progressive.inline, 32));
	const sharedExecution = elapsed(() => executeProgressivePayload(progressive.shared, 32));
	return {
		...payloadBytes('applicationPayload', applicationPayload),
		...payloadBytes('attributedFramework', attributedFramework),
		...payloadBytes('indexedFramework', indexedFramework),
		// Whole-response sizes remain transport counter-metrics. They deliberately
		// include application IDs, schemas, and values and are not framework cost.
		...payloadBytes('attributed', attributed),
		...payloadBytes('indexed', indexed),
		attributedParseMs: attributedParse.duration,
		indexedParseMs: indexedParse.duration,
		...payloadBytes('inlineProgressive', progressive.inline),
		...payloadBytes('sharedProgressive', progressive.shared),
		inlineProgressiveExecutionMs: inlineExecution.duration,
		sharedProgressiveExecutionMs: sharedExecution.duration
	};
}

function parseAttributedBoundaries(html) {
	const document = new JSDOM(`<body>${html}</body>`).window.document;
	return [...document.querySelectorAll('[data-exact-client-boundary]')].map((boundary) => ({
		id: boundary.getAttribute('data-exact-client-boundary'),
		name: boundary.getAttribute('data-exact-client-name'),
		props: JSON.parse(boundary.getAttribute('data-exact-client-props')).props
	}));
}

function parseIndexedBoundaries(html) {
	const document = new JSDOM(`<body>${html}</body>`).window.document;
	const groups = JSON.parse(document.getElementById('__exact_hydration').textContent).h[1];
	return [...document.querySelectorAll('[data-xh]')].map((boundary) => {
		const [groupIndex, rowIndex] = boundary
			.getAttribute('data-xh')
			.split('.')
			.map((value) => Number.parseInt(value, 36));
		const [name, keys, rows] = groups[groupIndex];
		const [id, ...values] = rows[rowIndex];
		return { id, name, props: Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
	});
}

function renderBoundaries(records, compact) {
	const boundaries = records.map((record) => {
		const vnode = createServerBoundary(record.id, record.name, record.props);
		return compact ? markFiniteClientBoundary(vnode) : vnode;
	});
	return renderToHydratableString(createVNode(Fragment, null, ...boundaries), {
		markers: false
	}).htmlWithHydration;
}

function progressivePayloads(count) {
	const inline = Array.from({ length: count }, (_, index) =>
		scopedReplacementScript(`boundary-${index}`, `<p>Resolved ${index}</p>`, {
			rootId: 'exact-root'
		})
	).join('');
	const state = {};
	progressiveHtmlChunk(
		{ event: 'shell', version: 1, html: '<p>shell</p>' },
		{ rootId: 'exact-root' },
		state
	);
	const shared = Array.from({ length: count }, (_, index) =>
		progressiveHtmlChunk(
			{
				event: 'replace',
				version: 1,
				id: `boundary-${index}`,
				html: `<p>Resolved ${index}</p>`
			},
			{ rootId: 'exact-root' },
			state
		)
	).join('');
	return { inline, shared };
}

function executeProgressivePayload(payload, count) {
	const roots = Array.from(
		{ length: count },
		(_, index) => `<div id="boundary-${index}">Loading</div>`
	).join('');
	const dom = new JSDOM(`<body><div id="exact-root">${roots}</div>${payload}</body>`, {
		runScripts: 'dangerously'
	});
	if (dom.window.document.querySelectorAll('#exact-root p').length !== count)
		throw new Error('progressive publication lost a replacement');
	dom.window.close();
}
