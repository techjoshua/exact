import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertComponentLocalTargetAbiStructuralGate,
	componentLocalTargetAbiFallbackFields,
	createComponentLocalTargetAbiStructuralReport
} from './structural-report.mjs';

const zeroCounts = () => ({
	nativeComponents: 1,
	targetArtifacts: 1,
	declinedNativeJsxRegions: 0,
	fallbackBearingArtifacts: 0,
	genericNativeBindingGroups: 0,
	genericNativeRendererImports: 0,
	genericNativeSsrImports: 0,
	runtimeCreatedNativeArtifacts: 0,
	parentOwnedChildDirtyRouting: 0
});

test('separates explicit boundaries from native structural acceptance', () => {
	const react = zeroCounts();
	react.genericNativeRendererImports = 2;
	const report = createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'client', boundary: 'native', counts: zeroCounts() },
		{ id: 'ReactIsland', target: 'client', boundary: 'react', counts: react }
	]);

	assert.equal(report.native.artifacts, 1);
	assert.equal(report.native.totals.genericNativeRendererImports, 0);
	assert.equal(report.explicitBoundaries.react.totals.genericNativeRendererImports, 2);
	assert.equal(assertComponentLocalTargetAbiStructuralGate(report), report);
});

test('rejects incomplete records so absent evidence cannot masquerade as zero', () => {
	const incomplete = zeroCounts();
	delete incomplete.declinedNativeJsxRegions;
	assert.throws(
		() =>
			createComponentLocalTargetAbiStructuralReport([
				{ id: 'Page', target: 'client', boundary: 'native', counts: incomplete }
			]),
		/requires a non-negative integer declinedNativeJsxRegions/
	);
});

test('reports every nonzero native fallback at the final structural gate', () => {
	const counts = zeroCounts();
	counts.declinedNativeJsxRegions = 3;
	counts.parentOwnedChildDirtyRouting = 1;
	const report = createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'server', boundary: 'native', counts }
	]);

	assert.deepEqual(componentLocalTargetAbiFallbackFields, [
		'declinedNativeJsxRegions',
		'fallbackBearingArtifacts',
		'genericNativeBindingGroups',
		'genericNativeRendererImports',
		'genericNativeSsrImports',
		'runtimeCreatedNativeArtifacts',
		'parentOwnedChildDirtyRouting'
	]);
	assert.throws(
		() => assertComponentLocalTargetAbiStructuralGate(report),
		/declinedNativeJsxRegions=3, parentOwnedChildDirtyRouting=1/
	);
});

test('supports phase-specific zero gates without weakening final acceptance', () => {
	const counts = zeroCounts();
	counts.genericNativeSsrImports = 4;
	const report = createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'client', boundary: 'native', counts }
	]);

	assert.equal(
		assertComponentLocalTargetAbiStructuralGate(report, ['declinedNativeJsxRegions']),
		report
	);
	assert.throws(
		() => assertComponentLocalTargetAbiStructuralGate(report),
		/genericNativeSsrImports=4/
	);
});

test('aggregates compiler decline diagnostics without adding them to acceptance totals', () => {
	const first = zeroCounts();
	first['declinedReason:uncertain-parent-namespace'] = 2;
	const second = zeroCounts();
	second['declinedReason:uncertain-parent-namespace'] = 3;
	second['declinedReason:spread-attribute'] = 1;
	second['genericReason:nested-property-read'] = 4;
	const report = createComponentLocalTargetAbiStructuralReport([
		{ id: 'First', target: 'client', boundary: 'native', counts: first },
		{ id: 'Second', target: 'server', boundary: 'native', counts: second }
	]);

	assert.deepEqual(report.native.diagnostics, {
		'uncertain-parent-namespace': 5,
		'spread-attribute': 1,
		'generic:nested-property-read': 4
	});
	assert.equal(report.native.totals.declinedNativeJsxRegions, 0);
});

test('aggregates generic renderer attribution without adding it to acceptance totals', () => {
	const counts = zeroCounts();
	counts.genericNativeRendererImports = 2;
	counts['genericRendererReason:createCompiledVNode'] = 1;
	counts['genericRendererReason:constructRenderComponentInstance'] = 1;
	const report = createComponentLocalTargetAbiStructuralReport([
		{ id: 'Page', target: 'client', boundary: 'native', counts }
	]);

	assert.deepEqual(report.native.diagnostics, {
		'renderer:createCompiledVNode': 1,
		'renderer:constructRenderComponentInstance': 1
	});
	assert.equal(report.native.totals.genericNativeRendererImports, 2);
});

test('rejects malformed diagnostic fields', () => {
	const counts = zeroCounts();
	counts['declinedReason:'] = 1;
	assert.throws(
		() =>
			createComponentLocalTargetAbiStructuralReport([
				{ id: 'Page', target: 'client', boundary: 'native', counts }
			]),
		/unknown structural fields/
	);
});
