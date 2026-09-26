import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';
import { exactPluginOptions } from './exact-options.mjs';

export default defineConfig({
	plugins: [exactVitest({ compiler: exactPluginOptions })]
});
