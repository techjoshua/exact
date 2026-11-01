import { it } from 'vitest';
import { Children, createElement } from './index.js';
import { verifyReactChildrenSemantics } from '../../component-composition-corpus/test-support/react-children-semantics-journey.js';
it('preserves child utility slot, key, callback and output contracts', () =>
	verifyReactChildrenSemantics({ Children, createElement }));
