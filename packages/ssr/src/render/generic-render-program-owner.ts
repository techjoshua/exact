import { withComponentDomain, type AnyComponentInstance } from '@exactjs/core';
import { withEffectScope } from '@exactjs/reactive';
import { registerRenderProgramOwnerRunner } from './render-program-owner-capability.js';

registerRenderProgramOwnerRunner(<T>(owner: AnyComponentInstance, work: () => T): T =>
	withEffectScope(owner.scope, () => withComponentDomain(owner.domain, work))
);
