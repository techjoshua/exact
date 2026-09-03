import { dispose, render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { afterEach, describe, expect, it } from 'vitest';
import {
	capabilitiesOwner,
	capabilitiesRoot,
	capabilityUnmountCount,
	corpusButtonRef,
	resetCapabilityObservations
} from './scenarios/capabilities.fixtures.js';
import { enhancementsRoot } from './scenarios/enhancements.fixtures.js';
import {
	corpus as corpusEnhancement,
	enhancementTones,
	resetEnhancementTones
} from './scenarios/enhancement-implementation.fixtures.js';
import { dynamicRoot } from './scenarios/dynamic.fixtures.js';
import { fundamentalsRoot } from './scenarios/fundamentals.fixtures.js';
import { registryRoot } from './scenarios/registry.fixtures.js';
import {
	inputProjectionOwner,
	inputProjectionRoot,
	stateOwner,
	stateRoot
} from './scenarios/state.fixtures.js';
import { structureOwner, structureRoot } from './scenarios/structure.fixtures.js';
import { indexedTaskDependenciesRoot, taskRoot } from './scenarios/tasks.fixtures.js';

const containers: Element[] = [];

afterEach(() => {
	for (const container of containers.splice(0)) dispose(container, true);
});

describe('composition corpus client behavior', () => {
	it('mounts static, nested, and registry components from compiled artifacts', () => {
		expect(mount(fundamentalsRoot('ready')).innerHTML).toContain(
			'<strong data-role="label">ready</strong>'
		);
		expect(mount(registryRoot('second')).querySelector('[data-view]')?.textContent).toBe('second');
		expect(mount(dynamicRoot()).querySelector('[data-dynamic]')?.textContent).toBe('first');
	});

	it('updates only indexed text and properties while preserving intrinsic identity', () => {
		const container = mount(stateRoot('items'));
		const output = container.querySelector('output')!;
		const projected = container.querySelector('[data-role="adjacent-text"]')!;
		const textarea = container.querySelector<HTMLTextAreaElement>(
			'[data-role="static-native-attributes"]'
		)!;
		const progress = container.querySelector<HTMLProgressElement>(
			'[data-role="direct-state-property"]'
		)!;
		const button = container.querySelector('button')!;

		stateOwner().state.count = 2;
		stateOwner().state.enabled = false;
		flushSync();

		expect(container.querySelector('output')).toBe(output);
		expect(container.querySelector('button')).toBe(button);
		expect(output.textContent).toBe('items:2');
		expect(projected.textContent).toBe('Count & 2');
		expect(textarea.maxLength).toBe(2000);
		expect(textarea.required).toBe(true);
		expect(textarea.getAttribute('aria-label')).toBe('items');
		expect(progress.value).toBe(2);
		expect(button.disabled).toBe(true);
		expect(button.dataset.count).toBe('2');
		expect(container.querySelector('[data-scenario="state"]')?.className).toBe('state-root');
	});

	it('applies one finalized prop replacement through the receiving input plan', () => {
		const container = mount(inputProjectionRoot());
		const output = container.querySelector('output')!;
		const owner = inputProjectionOwner();
		expect(output.textContent).toBe('loading:missing:idle');

		render(inputProjectionRoot({ label: 'accepted' }), container);
		flushSync();

		expect(container.querySelector('output')).toBe(output);
		expect(inputProjectionOwner()).toBe(owner);
		expect(output.textContent).toBe('ready:accepted:idle');
		const nested = container.querySelector('[data-role="nested-prop-label"]');
		expect(nested?.textContent).toBe('accepted');

		render(inputProjectionRoot({ label: 'replaced' }), container);
		flushSync();

		expect(container.querySelector('[data-role="nested-prop-label"]')).toBe(nested);
		expect(nested?.textContent).toBe('replaced');
	});

	it('updates a conditional range without replacing adjacent siblings', () => {
		const container = mount(structureRoot);
		const before = container.querySelector('[data-role="before"]');
		const after = container.querySelector('[data-role="after"]');

		structureOwner().state.visible = false;
		flushSync();

		expect(container.querySelector('[data-role="conditional"]')).toBeNull();
		expect(container.querySelector('[data-role="before"]')).toBe(before);
		expect(container.querySelector('[data-role="after"]')).toBe(after);
	});

	it('preserves keyed identity, provides context, and fulfills refs', () => {
		const container = mount(capabilitiesRoot);
		const alpha = container.querySelector('[data-id="a"]');
		const betaLabel = container.querySelector('[data-id="b"] [data-role="item-label"]');

		capabilitiesOwner().state.items[1]!.label = 'Beta nested';
		flushSync();
		expect(container.querySelector('[data-id="b"] [data-role="item-label"]')).toBe(betaLabel);
		expect(betaLabel?.textContent).toBe('Beta nested');

		capabilitiesOwner().state.items = [
			{ id: 'b', label: 'Beta updated' },
			{ id: 'a', label: 'Alpha' }
		];
		flushSync();

		expect(container.querySelector('[data-role="context"]')?.textContent).toBe('provided');
		expect(container.querySelector('[data-id="a"]')).toBe(alpha);
		expect(container.querySelector('[data-id="b"] [data-role="item-label"]')?.textContent).toBe(
			'Beta updated'
		);
		expect(capabilitiesOwner().refs.get(corpusButtonRef)).toBe(container.querySelector('button'));
	});

	it('runs owner cleanup exactly once when its root is disposed', () => {
		resetCapabilityObservations();
		const container = mount(capabilitiesRoot);
		dispose(container, true);
		containers.splice(containers.indexOf(container), 1);

		expect(capabilityUnmountCount()).toBe(1);
	});

	it('executes a compiler-defined client task through its authored interaction', async () => {
		const container = mount(taskRoot);
		await expect
			.poll(() => {
				flushSync();
				return {
					status: container.querySelector('output')?.textContent,
					runs: container.querySelector('data')?.textContent
				};
			})
			.toEqual({ status: 'ready', runs: '1' });
		container.querySelector('button')!.click();
		await expect
			.poll(() => {
				flushSync();
				return {
					status: container.querySelector('output')?.textContent,
					runs: container.querySelector('data')?.textContent
				};
			})
			.toEqual({ status: 'ready', runs: '2' });
	});

	it('reactivates exact and arbitrary task inputs after a prop replacement', async () => {
		const container = mount(indexedTaskDependenciesRoot(2));
		const output = container.querySelector('output')!;
		await expect.poll(() => output.textContent).toBe('2:3');

		render(indexedTaskDependenciesRoot(4), container);
		await expect.poll(() => output.textContent).toBe('4:5');
		expect(container.querySelector('output')).toBe(output);
	});

	it('routes intrinsic and component enhancements to their semantic targets', () => {
		resetEnhancementTones();
		const container = mount(enhancementsRoot, {
			enhancementCatalog: new Map([['./enhancement-routing.fixtures.js#corpus', corpusEnhancement]])
		});

		expect(
			container.querySelector('[data-role="intrinsic-target"]')?.getAttribute('data-corpus-tone')
		).toBe('intrinsic');
		expect(enhancementTones()).toEqual(['intrinsic', 'component']);
		expect(
			container.querySelector('[data-role="component-target"]')?.getAttribute('data-corpus-tone')
		).toBe('component');
	});
});

function mount(
	operation: Parameters<typeof render>[0],
	options?: Parameters<typeof render>[2]
): HTMLDivElement {
	const container = document.createElement('div');
	containers.push(container);
	render(operation, container, options);
	flushSync();
	return container;
}
