import { exact } from '@exactjs/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [exact({ target: 'client' })],
	test: { include: ['src/**/*.test.ts'] }
});
