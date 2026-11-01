// @vitest-environment jsdom
import { reactive, registerReactiveListKey, decodeReactiveProtocolValue } from '@exactjs/reactive';
import { renderHydrationScript } from '@exactjs/ssr';
import { it } from 'vitest';
import { readExactHydrationConfig } from './index.js';
import {
	createHydrationRecordScript,
	verifyHydrationRecordState
} from '../../component-composition-corpus/test-support/hydration-record-journey.js';

it('restores literal records and reactive collections from the public document reader', () => {
	const root = document.createElement('main');
	root.innerHTML = createHydrationRecordScript({
		reactive,
		registerReactiveListKey,
		decodeReactiveProtocolValue,
		renderHydrationScript
	});
	verifyHydrationRecordState(readExactHydrationConfig(root).state);
});
