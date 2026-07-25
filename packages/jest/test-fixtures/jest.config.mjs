import { exactJest } from '@exactjs/jest';

export default {
	...exactJest(),
	rootDir: '..',
	testMatch: ['<rootDir>/test-fixtures/**/*.jest.tsx']
};
