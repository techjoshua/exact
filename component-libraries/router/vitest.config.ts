import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: { include: /(?:components|\.fixtures)\.tsx$/, reactCompatibility: false }
		})
	]
});
