import type { TaskContext } from './contracts.js';
import { createTaskOwnerRecord, executeTaskFrame } from './frame-runtime.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import {
	activateServerComponentTaskForHost,
	ownServerComponentExecutionResource,
	type ServerComponentTaskSlice
} from './server-component-execution.js';

const owners = new WeakMap<object, TaskOwnerRecord>();

/**
 * Activates a direct SSR slice that invokes child tasks. Only this compiler-selected path acquires
 * a task owner and structural frames. Descendants share the slice's existing renderer permit;
 * its output ports publish after child settlement and cleanup. Request disposal cancels all lanes.
 */
export function activateServerComponentTaskTreeForHost<Args extends unknown[], Result>(
	host: object,
	slice: ServerComponentTaskSlice,
	transitionId: string,
	work: (...args: [...Args, TaskContext]) => Result | PromiseLike<Result>,
	...authored: Args
): void {
	let owner = owners.get(host);
	if (!owner) {
		owner = createTaskOwnerRecord('server component tasks');
		const resource = owner;
		ownServerComponentExecutionResource(host, {
			async [Symbol.asyncDispose]() {
				if (owners.get(host) === resource) owners.delete(host);
				await resource[Symbol.asyncDispose]();
			}
		});
		owners.set(host, owner);
	}
	const taskOwner = owner;
	activateServerComponentTaskForHost(
		host,
		slice,
		transitionId,
		(...inputs: [...Args, TaskContext]) => {
			const context = inputs.pop() as TaskContext;
			return executeTaskFrame(
				{
					owner: taskOwner,
					detached: true,
					activation: context.activation,
					generation: context.generation,
					placement: 'server',
					readiness: slice[2],
					label: slice[3],
					optimistic: context.optimistic
				},
				(frameContext) => work(...(inputs as unknown as Args), frameContext)
			);
		},
		...authored
	);
}
