import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const classes = {
	declaration: 'class Box{work(){owner.value++;return owner.value;}}return new Box();',
	expression: 'return new class Box{work(){owner.value++;return owner.value;}}();',
	inheritance:
		'class Base{work(){owner.value++;return owner.value;}}class Box extends Base{work(){return super.work();}}return new Box();',
	field: 'class Box{work=()=>{owner.value++;return owner.value;};}return new Box();',
	private:
		'class Box{#value=0;work(){this.#value++;owner.value=this.#value;return owner.value;}}return new Box();'
};

for (const target of ['client', 'server'] as const)
	for (const [name, declaration] of Object.entries(classes))
		it(`retains local class ${name} originals after creator closure (${target})`, async () => {
			const { compiled, runtime } = await privateHelperArtifact(
				`export function make(owner:{value:number}){${declaration}}`,
				target
			);
			const owner = { value: 0 };
			const root = { owner };
			const creator = runtime.createPendingReactiveTransaction(root);
			creator.read(root, 'owner');
			let selected: { work(): number };
			try {
				selected = creator.helper(compiled.make)(owner) as typeof selected;
			} finally {
				creator.discard();
			}
			const keys = Reflect.ownKeys(selected);
			const work = selected.work;
			const pending = runtime.createPendingReactiveTransaction(root);
			pending.read(root, 'owner');
			try {
				expect(pending.helper(work, selected)()).toBe(1);
				expect(owner.value).toBe(0);
				expect(pending.read(owner, 'value')).toBe(1);
				pending.discard();
				expect(owner.value).toBe(0);
				// Ordinary calls retain ordinary storage semantics and callable identity.
				expect(selected.work()).toBe(name === 'private' ? 2 : 1);
				expect(owner.value).toBe(name === 'private' ? 2 : 1);
				expect(selected.work).toBe(work);
				expect(Reflect.ownKeys(selected)).toEqual(keys);
			} finally {
				pending.discard();
			}
		});
