import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

for (const target of ['client', 'server'] as const)
	for (const assignment of ['direct', 'pattern'] as const)
		it(`retains native super prototype replacement during ${assignment} assignment (${target})`, async () => {
			const source = `class Base extends Array<number>{set value(value:number){this.push(value);}}class Other extends Array<number>{set value(value:number){this.push(value+10);}}export class Owner extends Base{work(){const change=()=>{Object.setPrototypeOf(Owner.prototype,Other.prototype);return 3;};${assignment === 'direct' ? 'super.value=change();' : '[super.value=change()]=[undefined];'}}}`;
			const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
			type Owner = number[] & { work(): void };
			const reference = new (authored.Owner as new () => Owner)();
			reference.work();
			expect([...reference]).toEqual([13]);
			const owner = new (compiled.Owner as new () => Owner)();
			const root = { owner };
			const pending = runtime.createPendingReactiveTransaction(root);
			pending.read(root, 'owner');
			try {
				pending.helper(owner.work, owner)();
				expect(owner.length).toBe(0);
				expect(pending.read(owner, '0')).toBe(13);
				pending.commit();
				expect([...owner]).toEqual([13]);
			} finally {
				pending.discard();
			}
		});
