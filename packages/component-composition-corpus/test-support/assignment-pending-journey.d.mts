/** Representative selection and settlement modes, without a Cartesian probe matrix. */
export const assignmentPendingCases: readonly {
	selection: string;
	settlement: string;
}[];
/** Checks selected storage, observation, inverse ownership and transaction cleanup. */
export function verifyAssignmentPending(
	api: Pick<typeof import('../../reactive/src/index.js'), 'reactive' | 'watch' | 'flushSync'> &
		Pick<
			typeof import('../../reactive/src/framework/transactions.js'),
			'createPendingReactiveTransaction'
		>,
	options: (typeof assignmentPendingCases)[number]
): void;
