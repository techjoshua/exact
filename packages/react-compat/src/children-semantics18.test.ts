import { it } from 'vitest';
import { Children, createElement } from './react18.js';
import { verifyReactChildrenSemantics } from '../../component-composition-corpus/test-support/react-children-semantics-journey.js';
it('preserves React 18 child utility slot, key, callback and output contracts', () =>
	verifyReactChildrenSemantics({ Children, createElement }));
