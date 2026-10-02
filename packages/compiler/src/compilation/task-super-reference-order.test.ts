import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

for (const target of ['client', 'server'] as const)
	for (const assignment of ['direct', 'pattern'] as const)
		it(`retains native super prototype replacement during ${assignment} assignment (${target})`, async () => {
			const source = `class Base extends Array<number>{set value(value:number){this.push(value);}}class Other extends Array<number>{set value(value:number){this.push(value+10);}}export class Owner extends Base{work(){const change=()=>{Object.setPrototypeOf(Owner.prototype,Other.prototype);return 3;};${assignment === 'direct' ? 'super.value=change();' : '[super.value=change()]=[undefined];'}}}`;
			const { compiled, authored } = await privateHelperArtifact(source, target);
			type Owner = number[] & { work(): void };
			const reference = new (authored.Owner as new () => Owner)();
			reference.work();
			expect([...reference]).toEqual([13]);
			const owner = new (compiled.Owner as new () => Owner)();
			// Prototype mutation stays ordinary helper execution, outside pending component state.
			owner.work();
			expect([...owner]).toEqual([13]);
		});
