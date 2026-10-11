import type { PendingOwnerProps } from './pending-owner-overlap.fixtures.js';

/** Backend operations let one observable journey run in jsdom and an actual browser. */
export interface PendingOwnerHarness {
	start(
		props: PendingOwnerProps,
		host: HTMLElement,
		entry: 'mount' | 'hydrate',
		report: (value: unknown) => void
	): Promise<void>;
	update(props: PendingOwnerProps, host: HTMLElement, report: (value: unknown) => void): void;
	dispose(host: HTMLElement): void;
}

function check(value: unknown, message: string): void {
	if (!value) throw new Error(message);
}

async function until(test: () => boolean, message: string) {
	const deadline = Date.now() + 5000;
	while (!test()) {
		check(Date.now() < deadline, message);
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

/** Crosses pending isolation, captured defaults, live props, host identity and retiring owners. */
export async function verifyPendingOwnerOverlap(
	harness: PendingOwnerHarness,
	entry: 'mount' | 'hydrate',
	enhanced: boolean
): Promise<void> {
	const container = document.createElement('div');
	document.body.append(container);
	const gates: { signal: AbortSignal; release(): void }[] = [];
	const removed: string[] = [];
	const reports: unknown[] = [];
	const report = (value: unknown) => reports.push(value);
	let props: PendingOwnerProps = {
		id: 'first',
		enhanced,
		wait: (signal) => new Promise<void>((release) => gates.push({ signal, release })),
		removed: (id) => removed.push(id)
	};
	try {
		await harness.start(props, container, entry, report);
		removed.length = 0;
		const firstHost = container.querySelector('section')!;
		const firstButton = firstHost.querySelector('button')!;
		const firstOutput = firstHost.querySelector('output')!;
		check(firstButton.textContent === 'default', 'Initial default is missing');
		firstButton.click();
		await until(() => gates.length === 1, 'First task did not start');
		check(firstOutput.textContent === 'idle', 'Pending helper write leaked');
		props = { ...props, label: 'fresh' };
		harness.update(props, container, report);
		check(
			container.querySelector('section') === firstHost &&
				firstHost.querySelector('button') === firstButton,
			'Same-key props replaced host identity'
		);
		check(firstButton.textContent === 'fresh', 'Defaulted prop did not rebind');
		if (enhanced) check(firstButton.dataset.corpusTone === 'fresh', 'Enhancement did not rebind');
		check(!gates[0]!.signal.aborted, 'Prop update cancelled retained work');
		gates[0]!.release();
		await until(
			() => firstOutput.textContent === 'default:done',
			'Pending invocation lost captured input'
		);
		firstButton.click();
		await until(() => gates.length === 2, 'Next invocation did not start');
		gates[1]!.release();
		await until(() => firstOutput.textContent === 'fresh:done', 'Next invocation used stale props');
		firstButton.click();
		await until(() => gates.length === 3, 'Retiring task did not start');
		props = { ...props, id: 'second', label: undefined };
		harness.update(props, container, report);
		const secondHost = container.querySelector('section')!;
		const secondButton = secondHost.querySelector('button')!;
		check(secondHost !== firstHost && !firstHost.isConnected, 'Replacement retained retired host');
		check(
			gates[2]!.signal.aborted && removed.join(',') === 'first',
			'Replacement failed cancellation or cleanup'
		);
		gates[2]!.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		check(
			secondHost.querySelector('output')!.textContent === 'idle',
			'Retired task published into successor'
		);
		firstButton.click();
		check(gates.length === 3, 'Retired handler started work');
		secondButton.click();
		await until(() => gates.length === 4, 'Successor task did not start');
		gates[3]!.release();
		await until(
			() => secondHost.querySelector('output')!.textContent === 'default:done',
			'Successor did not make progress'
		);
		secondButton.click();
		await until(() => gates.length === 5, 'Final task did not start');
		harness.dispose(container);
		check(gates[4]!.signal.aborted, 'Disposal failed to abort work');
		gates[4]!.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		secondButton.click();
		check(
			gates.length === 5 && !container.childNodes.length,
			'Disposed handler or DOM remains active'
		);
		check(removed.join(',') === 'first,second', 'Owner cleanup was not exactly once');
		check(!reports.length, 'Unexpected framework report');
	} finally {
		harness.dispose(container);
		for (const gate of gates) gate.release();
		container.remove();
	}
}

/** Replays a bounded schedule against a model of committed state and current owner/generation. */
export async function verifyPendingOwnerSequence(
	harness: PendingOwnerHarness,
	entry: 'mount' | 'hydrate',
	enhanced: boolean,
	seed: number
): Promise<void> {
	const container = document.createElement('div');
	document.body.append(container);
	const gates: { signal: AbortSignal; release(): void; input: string; owner: number }[] = [];
	const removed: string[] = [];
	const reports: unknown[] = [];
	const stale: HTMLButtonElement[] = [];
	const active = new Set<number>();
	let owner = 0,
		committed = 'idle',
		current: number | undefined,
		random = seed;
	let props: PendingOwnerProps = {
		id: String(owner),
		enhanced,
		wait: (signal) =>
			new Promise<void>((release) =>
				gates.push({ signal, release, input: props.label ?? 'default', owner })
			),
		removed: (id) => removed.push(id)
	};
	const report = (value: unknown) => reports.push(value);
	const button = () => container.querySelector<HTMLButtonElement>('button')!;
	const value = () => container.querySelector('output')!.textContent;
	const next = () => {
		random ^= random << 13;
		random ^= random >>> 17;
		random ^= random << 5;
		return random >>> 0;
	};
	const history: string[] = [];
	try {
		await harness.start(props, container, entry, report);
		removed.length = 0;
		for (let step = 0; step < 48; step++) {
			const action =
				step < 6
					? ['start', 'parallel', 'props', 'start', 'release', 'replace'][step]!
					: ['start', 'parallel', 'props', 'replace', 'release'][next() % 5]!;
			history.push(action);
			if (action === 'start' || action === 'parallel') {
				const previous = current;
				const count = gates.length;
				(action === 'parallel'
					? container.querySelector<HTMLButtonElement>('[data-parallel]')!
					: button()
				).click();
				await until(() => gates.length === count + 1, `seed ${seed}: task selection stalled`);
				active.add(count);
				if (action === 'start') {
					current = count;
					if (previous !== undefined) {
						check(gates[previous]!.signal.aborted, 'Latest task did not fence its predecessor');
						active.delete(previous);
					}
				}
			} else if (action === 'props') {
				const retained = button();
				props = { ...props, label: next() % 2 ? `label-${step}` : undefined };
				harness.update(props, container, report);
				check(button() === retained, 'Retained props replaced button');
				if (current !== undefined)
					check(!gates[current]!.signal.aborted, 'Prop rebinding cancelled current work');
			} else if (action === 'replace') {
				stale.push(button(), container.querySelector<HTMLButtonElement>('[data-parallel]')!);
				owner++;
				props = { ...props, id: String(owner) };
				harness.update(props, container, report);
				committed = 'idle';
				current = undefined;
				for (const index of active)
					check(gates[index]!.signal.aborted, 'Replacement retained pending capability');
				active.clear();
				check(
					removed.join(',') ===
						Array.from({ length: owner }, (_, index) => String(index)).join(','),
					'Replacement cleanup was not exactly once'
				);
			} else if (gates.length) {
				const index = next() % gates.length;
				const gate = gates[index]!;
				gate.release();
				if (active.has(index) && !gate.signal.aborted) {
					committed = gate.input + ':done';
					active.delete(index);
					if (index === current) current = undefined;
					await until(() => value() === committed, 'Current generation did not publish');
				} else await new Promise((resolve) => setTimeout(resolve, 0));
			}
			check(
				value() === committed,
				`seed ${seed}, step ${step}, ${history.join(',')}: committed state diverged`
			);
			check(button().textContent === (props.label ?? 'default'), 'Live props diverged');
			if (enhanced)
				check(
					button().dataset.corpusTone === (props.label ?? 'default'),
					'Enhancement props diverged'
				);
			const count = gates.length;
			for (const retired of stale) retired.click();
			check(gates.length === count, 'Retired handler started a task');
			check(!reports.length, 'Unexpected framework report in sequence');
		}
		const last = button();
		const count = gates.length;
		const parallel = container.querySelector<HTMLButtonElement>('[data-parallel]')!;
		parallel.click();
		await until(() => gates.length === count + 1, 'Final parallel task did not start');
		last.click();
		await until(() => gates.length === count + 2, 'Final disposal witness did not start');
		harness.dispose(container);
		check(
			gates[count]!.signal.aborted && gates[count + 1]!.signal.aborted,
			'Final owner retained work after disposal'
		);
		for (const gate of gates) gate.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		last.click();
		check(gates.length === count + 2 && !container.childNodes.length, 'Disposed work restarted');
		check(
			removed.length === owner + 1 && new Set(removed).size === removed.length,
			'Final cleanup was not exactly once'
		);
		check(!reports.length, 'Unexpected final framework report');
	} catch (error) {
		throw new Error(
			`Pending owner sequence seed=${seed}, entry=${entry}, enhanced=${enhanced}, actions=${history.join(',')}`,
			{ cause: error }
		);
	} finally {
		harness.dispose(container);
		for (const gate of gates) gate.release();
		container.remove();
	}
}
