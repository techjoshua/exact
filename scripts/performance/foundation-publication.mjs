import { JSDOM } from 'jsdom';
import { scopedReplacementScript } from '../../packages/ssr/dist/stream/protocol.js';
import { elapsed, payloadBytes } from './foundation-measurement.mjs';

/** Compares self-describing hydration and inline reveals with compact publication candidates. */
export function measureHydrationPublication() {
	const count = 200;
	const records = Array.from({ length: count }, (_, index) => ({
		id: `boundary-${index}`,
		name: index % 2 ? 'EditableRow' : 'SelectableRow',
		props: { index, label: `Parcel ${index}`, selected: index % 3 === 0 }
	}));
	const attributed = records
		.map(
			(record) =>
				`<div data-exact-client-boundary="${record.id}" data-exact-client-name="${record.name}" data-exact-client-props="${escapeAttribute(JSON.stringify({ props: record.props }))}"><span>${record.props.label}</span></div>`
		)
		.join('');
	const compactGroups = ['SelectableRow', 'EditableRow'].map((name) => {
		const entries = records.filter((record) => record.name === name);
		return [
			name,
			['index', 'label', 'selected'],
			entries.map((record) => [
				record.id,
				record.props.index,
				record.props.label,
				record.props.selected
			])
		];
	});
	const groupIndexes = new Map(compactGroups.map((group, index) => [group[0], index]));
	const groupRows = new Map();
	const indexed = `${records
		.map((record) => {
			const row = groupRows.get(record.name) ?? 0;
			groupRows.set(record.name, row + 1);
			return `<div data-exact-client="${groupIndexes.get(record.name)}.${row}"><span>${record.props.label}</span></div>`;
		})
		.join(
			''
		)}<script type="application/json" id="__exact_islands">${jsonForScript(compactGroups)}</script>`;
	const attributedParse = elapsed(() => parseAttributedBoundaries(attributed));
	const indexedParse = elapsed(() => parseIndexedBoundaries(indexed));
	if (attributedParse.value.length !== count || indexedParse.value.length !== count)
		throw new Error('hydration publication prototype lost a boundary record');
	const progressive = progressivePayloads(32);
	const inlineExecution = elapsed(() => executeProgressivePayload(progressive.inline, 32));
	const sharedExecution = elapsed(() => executeProgressivePayload(progressive.shared, 32));
	return {
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
	const groups = JSON.parse(document.getElementById('__exact_islands').textContent);
	return [...document.querySelectorAll('[data-exact-client]')].map((boundary) => {
		const [groupIndex, rowIndex] = boundary
			.getAttribute('data-exact-client')
			.split('.')
			.map(Number);
		const [name, keys, rows] = groups[groupIndex];
		const [id, ...values] = rows[rowIndex];
		return { id, name, props: Object.fromEntries(keys.map((key, index) => [key, values[index]])) };
	});
}

function progressivePayloads(count) {
	const inline = Array.from({ length: count }, (_, index) =>
		scopedReplacementScript(`boundary-${index}`, `<p>Resolved ${index}</p>`, {
			rootId: 'exact-root'
		})
	).join('');
	const helper = `<script>globalThis.__exactReplace=function(i,h){var r=document.getElementById("exact-root");if(r&&r.getAttribute("data-exact-hydrated")!=="true"){var e=document.getElementById(i),t=document.createElement("template");t.innerHTML=h;if(e&&(e===r||r.contains(e)))e.replaceChildren(t.content);else{var w=document.createTreeWalker(r,128),s=null,n;while(n=w.nextNode())if(n.data==="exact:"+i){s=n;break}if(s){var p=s.parentNode,x=s;while(x&&!(x.nodeType===8&&x.data==="/exact:"+i))x=x.nextSibling;if(x){var a=x.nextSibling;p.insertBefore(t.content,s);while(s!==a){var q=s.nextSibling;p.removeChild(s);s=q}}}}}}</script>`;
	const shared = `${helper}${Array.from(
		{ length: count },
		(_, index) =>
			`<script>__exactReplace(${JSON.stringify(`boundary-${index}`)},${JSON.stringify(`<p>Resolved ${index}</p>`)})</script>`
	).join('')}`;
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
		throw new Error('progressive publication prototype lost a replacement');
	dom.window.close();
}

function escapeAttribute(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function jsonForScript(value) {
	return JSON.stringify(value)
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
