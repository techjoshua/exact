import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import { expect, it } from 'vitest';
import {
	bindComponentUpdateTarget,
	publishComponentUpdateTargets,
	type CompiledComponentUpdateTargets
} from './component-update-storage.js';

it('removes retired regions from active update snapshots without admitting newly mounted replacements', () => {
	const targets: CompiledComponentUpdateTargets = [];
	const stops: Array<{ stop(): void }> = [];
	const child = { stopBindings: stops } as unknown as ExactRenderProgramBindingTarget;
	const replacement = { stopBindings: [] } as unknown as ExactRenderProgramBindingTarget;
	bindComponentUpdateTarget(child, targets, 0);
	publishComponentUpdateTargets(targets, (outer) => {
		expect(outer[0]).toBe(child);
		publishComponentUpdateTargets(targets, (inner) => {
			stops[0]!.stop();
			bindComponentUpdateTarget(replacement, targets, 0);
			expect(inner[0]).toBeUndefined();
			expect(outer[0]).toBeUndefined();
		});
	});
	expect(targets.publishing).toBeUndefined();
	publishComponentUpdateTargets(targets, (next) => expect(next[0]).toBe(replacement));
});

it('releases the active snapshot when a generated update throws', () => {
	const targets: CompiledComponentUpdateTargets = [];
	const target = { stopBindings: [] } as unknown as ExactRenderProgramBindingTarget;
	bindComponentUpdateTarget(target, targets, 0);
	expect(() =>
		publishComponentUpdateTargets(targets, () => {
			throw new Error('update failed');
		})
	).toThrow('update failed');
	expect(targets.publishing).toBeUndefined();
});
