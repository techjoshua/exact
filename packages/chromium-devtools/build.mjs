import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('./dist/', import.meta.url));
await mkdir(dist, { recursive: true });
for (const file of ['devtools.html', 'panel.html', 'panel.css']) {
	await cp(
		new URL(`./src/static/${file}`, import.meta.url),
		new URL(`./dist/${file}`, import.meta.url)
	);
}
