import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Shares task-created member and async closure writes across direct SSR and client tasks. */
export const taskClosureRegressionCases: TaskStateRegressionCase[] = [
	{
		name: 'task-created method lexical owner',
		work: "const owner=this;const calls={put(){owner.state.count=2;}};calls.put();this.state.trace=''+owner.state.count;",
		expected: '2'
	},
	{
		name: 'ordinary async closure lexical owner',
		work: "const owner=this;const put=async()=>{owner.state.count=1;await Promise.resolve();owner.state.count+=2;};await put();this.state.trace=''+owner.state.count;",
		expected: '3'
	}
];
