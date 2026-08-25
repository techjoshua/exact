import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const clientRoot = path.resolve('dist/client');
const sourceFiles = (await filesBelow(clientRoot)).filter((file) =>
	/\.(?:css|js|svg)$/u.test(file)
);

await Promise.all(
	sourceFiles.flatMap((file) => [
		compress(file, '.br', (source) =>
			compressBrotli(source, {
				params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
			})
		),
		compress(file, '.gz', (source) => compressGzip(source, { level: 9 }))
	])
);

console.log(`Precompressed ${sourceFiles.length} Parcel Lab client assets`);

/** Returns every file beneath a generated client directory. */
async function filesBelow(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	return (
		await Promise.all(
			entries.map((entry) => {
				const location = path.join(directory, entry.name);
				return entry.isDirectory() ? filesBelow(location) : [location];
			})
		)
	).flat();
}

/** Writes one encoded sibling only when it is smaller than its source representation. */
async function compress(file, suffix, encode) {
	const source = await readFile(file);
	const encoded = await encode(source);
	if (encoded.length < source.length) await writeFile(`${file}${suffix}`, encoded);
}
