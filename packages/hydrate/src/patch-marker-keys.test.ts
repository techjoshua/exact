import { createCompiledKeyedChildReceipt } from '@exactjs/core/runtime/component-operations';
import {
	renderKeyedListSnapshot,
	parseKeyedListSnapshotHtml,
	diffKeyedListItems
} from '@exactjs/ssr';
// @vitest-environment jsdom
import { it } from 'vitest';
import { encodeExactMarkerPart } from '@exactjs/core';
import { applyPatches } from './patches.js';
import {
	listMarkerCases,
	verifyListMarkerKeys,
	markerKeySnapshots,
	verifyMarkerSnapshots
} from '../../component-composition-corpus/test-support/list-marker-journey.js';

it.each(listMarkerCases)('preserves protocol list identity through %s', (scenario) => {
	verifyListMarkerKeys({ encodeExactMarkerPart, applyPatches }, document, [scenario]);
});

it('applies actual SSR snapshot diffs without losing retained keyed nodes', async () => {
	const snapshots = await markerKeySnapshots({
		renderKeyedListSnapshot,
		parseKeyedListSnapshotHtml,
		diffKeyedListItems
	});
	verifyMarkerSnapshots({ encodeExactMarkerPart, applyPatches }, document, snapshots);
});

it('keeps nested keyed receipts out of the enclosing snapshot list membership', async () => {
	const snapshots = await markerKeySnapshots(
		{
			renderKeyedListSnapshot,
			parseKeyedListSnapshotHtml,
			diffKeyedListItems,
			createCompiledKeyedChildReceipt
		},
		true
	);
	verifyMarkerSnapshots({ encodeExactMarkerPart, applyPatches }, document, snapshots);
});
