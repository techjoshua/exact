import type { Difficulty, Puzzle } from './types.js';
import { createPuzzleSeed, generatePuzzle, generatedPuzzleFromId } from './puzzle-generation.js';

/** Locally bundled puzzles keep the demo deterministic and fully offline. */
export const puzzles: readonly Puzzle[] = [
	{
		id: 'gentle-morning',
		difficulty: 'gentle',
		title: 'Morning stretch',
		givens: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
		solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
	},
	{
		id: 'gentle-breeze',
		difficulty: 'gentle',
		title: 'Open window',
		givens: '200080300060070084030500209000105408000000000402706000301007040720040060004010003',
		solution: '245981376169273584837564219976125438513498627482736951391657842728349165654812793'
	},
	{
		id: 'tricky-crossroads',
		difficulty: 'tricky',
		title: 'Crossroads',
		givens: '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
		solution: '435269781682571493197834562826195347374682915951743628519326874248957136763418259'
	},
	{
		id: 'tricky-ripple',
		difficulty: 'tricky',
		title: 'River stones',
		givens: '300000000005009000200504000020000700160000058704310600000890100000067080000005437',
		solution: '397681524645279813218534976823956741169742358754318692472893165531467289986125437'
	},
	{
		id: 'fiendish-orbit',
		difficulty: 'fiendish',
		title: 'Dark orbit',
		givens: '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
		solution: '462831957795426183381795426173984265659312748248567319926178534834259671517643892'
	},
	{
		id: 'fiendish-knot',
		difficulty: 'fiendish',
		title: 'The knot',
		givens: '030000080009000500007509200700105008020090030900402001004207100002000800070000090',
		solution: '235761489419328576867549213746135928521896734983472651394287165652913847178654392'
	}
];

/**
 * Returns a known puzzle by ID, falling back to the first bundled puzzle.
 * @exact client
 * @exact pure
 */
export function findPuzzle(id: string): Puzzle {
	return puzzles.find((puzzle) => puzzle.id === id) ?? generatedPuzzleFromId(id) ?? puzzles[0]!;
}

/**
 * Generates a fresh offline puzzle for the requested difficulty.
 * @exact client
 */
export function nextPuzzle(difficulty: Difficulty, currentId?: string): Puzzle {
	let seed = createPuzzleSeed();
	while (`generated-${difficulty}-${seed.toString(36)}` === currentId) seed = (seed + 1) >>> 0;
	return generatePuzzle(difficulty, seed);
}
