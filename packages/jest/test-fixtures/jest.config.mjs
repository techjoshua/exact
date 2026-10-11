import { exactJest } from '@exactjs/jest';

export default {
	...exactJest({ compiler: { compileTestModules: true } }),
	rootDir: '..',
	testMatch: ['<rootDir>/test-fixtures/**/*.jest.tsx']
};
