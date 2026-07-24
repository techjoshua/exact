import { exactJest } from '../dist/index.js';

export default {
	...exactJest(),
	rootDir: '..',
	testMatch: ['<rootDir>/test-fixtures/**/*.jest.tsx']
};
