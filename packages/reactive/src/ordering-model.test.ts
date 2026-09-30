import { expect, it } from 'vitest';
import { captureReactiveMutations, reactive, type ReactiveMutationJournal } from './index.js';
import {
	minimizeFailingSequence,
	seededChoices
} from '../../component-composition-corpus/test-support/sequence-model.js';

type Command = {
	kind: 'optimistic' | 'write' | 'rollback' | 'commit';
	cell: number;
	value: number;
	slot: number;
};

/** A cell's history predicts rollback independently of the reactive journal implementation. */
function replay(commands: readonly Command[]) {
	const state = reactive({
		profile: { left: 0, right: 0 },
		rows: new Map<string, number>(),
		selected: new Set<string>()
	});
	const histories: Array<Array<{ journal?: number; value: number | undefined }>> = [
		0,
		0,
		undefined,
		undefined,
		0
	].map((value) => [{ value }]);
	const journals = new Map<number, ReactiveMutationJournal>();
	const slots = new Map<number, number>();
	let next = 0;
	const actual = () => [
		state.profile.left,
		state.profile.right,
		state.rows.get('a'),
		state.rows.get('b'),
		Number(state.selected.has('a'))
	];
	const write = (cell: number, value: number) => {
		if (cell === 0) state.profile.left = value;
		else if (cell === 1) state.profile.right = value;
		else if (cell === 2 || cell === 3) state.rows.set(cell === 2 ? 'a' : 'b', value);
		else if (value) state.selected.add('a');
		else state.selected.delete('a');
	};
	try {
		for (const command of commands) {
			const { kind, cell, slot } = command;
			const value = cell === 4 ? command.value % 2 : command.value;
			if (kind === 'write' || kind === 'optimistic') {
				const journal = kind === 'optimistic' ? next++ : undefined;
				const changes = actual()[cell] !== value;
				if (journal !== undefined) {
					const previous = slots.get(slot);
					if (previous !== undefined) {
						journals.get(previous)!.discard();
						journals.delete(previous);
						for (const history of histories)
							for (const entry of history) if (entry.journal === previous) delete entry.journal;
					}
					slots.set(slot, journal);
					journals.set(
						journal,
						captureReactiveMutations(() => write(cell, value))
					);
				} else write(cell, value);
				if (changes) histories[cell]!.push({ journal, value });
			} else {
				const journal = slots.get(slot);
				if (journal !== undefined) {
					if (kind === 'rollback') {
						journals.get(journal)!.rollback();
						for (let index = 0; index < histories.length; index++)
							histories[index] = histories[index]!.filter((entry) => entry.journal !== journal);
					} else {
						journals.get(journal)!.discard();
						for (const history of histories)
							for (const entry of history) if (entry.journal === journal) delete entry.journal;
					}
					journals.delete(journal);
					slots.delete(slot);
				}
			}
			expect(actual()).toEqual(histories.map((history) => history.at(-1)!.value));
		}
	} finally {
		for (const journal of journals.values()) journal.discard();
	}
}

it.each(
	process.env.EXACT_EXTENDED_TESTING === '1' ? [17, 391, 7201, 8803, 10009, 65537] : [17, 391]
)(
	'models nested, Map and Set edits across optimistic completion orders (seed %i)',
	async (seed) => {
		const random = seededChoices(seed);
		const kinds = ['optimistic', 'write', 'rollback', 'commit'] as const;
		const commands = Array.from(
			{ length: process.env.EXACT_EXTENDED_TESTING === '1' ? 160 : 48 },
			() => ({ kind: kinds[random(4)]!, cell: random(5), value: random(10), slot: random(4) })
		);
		try {
			replay(commands);
		} catch (error) {
			if (!(error instanceof Error) || error.name !== 'AssertionError') throw error;
			const minimal = await minimizeFailingSequence(commands, (candidate) => {
				try {
					replay(candidate);
					return false;
				} catch (failure) {
					if (failure instanceof Error && failure.name === 'AssertionError') return true;
					throw failure;
				}
			});
			throw new Error(
				`Reactive ordering failed: seed=${seed}, commands=${JSON.stringify(minimal)}`,
				{ cause: error }
			);
		}
	}
);
