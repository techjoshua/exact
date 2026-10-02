import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const cases = {
	'array destination': '[this.#value]=[3];',
	'object destination': '({value:this.#value}={value:3});',
	'array default': '[this.#value=3]=[];',
	'loop destination': 'for(this.#value of [2,3]){}',
	'accessor destination': '[this.#current]=[3];',
	'super destination': '[super.baseValue]=[3];this.#value=super.baseValue;'
};

for (const target of ['client', 'server'] as const)
	for (const [name, body] of Object.entries(cases))
		it(`preserves private ${name} assignment ownership (${target})`, async () => {
			const base = name === 'super destination' ? 'Base' : 'Array<number>';
			const { compiled, runtime } = await privateHelperArtifact(
				`class Base extends Array<number>{#base=0;get baseValue(){return this.#base;}set baseValue(value:number){this.#base=value;}}export class Owner extends ${base}{#value=0;get value(){return this.#value;}get #current(){return this.#value;}set #current(value:number){this.#value=value;}work(){${body}return this.#value;}}`,
				target
			);
			const owner = new (compiled.Owner as new () => { value: number; work(): number })();
			const root = { owner };
			for (const settlement of ['discard', 'commit'] as const) {
				const pending = runtime.createPendingReactiveTransaction(root);
				pending.read(root, 'owner');
				expect(pending.helperMember(owner, 'work')()).toBe(3);
				expect(owner.value).toBe(0);
				pending[settlement]();
				expect(owner.value).toBe(settlement === 'commit' ? 3 : 0);
			}
			const readonly = runtime.reactive(owner, { readonly: true });
			const deniedRoot = { owner: readonly };
			const denied = runtime.createPendingReactiveTransaction(deniedRoot);
			denied.read(deniedRoot, 'owner');
			expect(() => denied.helperMember(readonly, 'work')()).toThrow('readonly');
			denied.discard();
			expect(owner.value).toBe(3);
		});
