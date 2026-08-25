import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve(process.argv[2] ?? '.tmp/cb_2025_us_state_20m/cb_2025_us_state_20m.shp');
const output = path.resolve(process.argv[3] ?? 'public/assets/us-states.svg');
const shp = await readFile(input);
const records = readDbf(await readFile(input.replace(/\.shp$/i, '.dbf')));
const shapes = readShapes(shp);
const excluded = new Set(['60', '66', '69', '78']);
const states = shapes
	.flatMap((shape, index) => {
		const record = records[index];
		if (!record || excluded.has(record.STATEFP)) return [];
		return [
			{
				fips: record.STATEFP,
				abbreviation: record.STUSPS,
				name: record.NAME,
				d: shapePath(shape, record.STATEFP)
			}
		];
	})
	.sort((left, right) => left.fips.localeCompare(right.fips));

const source = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 370">
	<style>
		.state { fill: #f0ece6; stroke: #817970; stroke-width: 1; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
		.special { fill: #dce8e9; }
		@media (prefers-color-scheme: dark) {
			.state { fill: #292724; stroke: #77716a; }
			.special { fill: #26383c; }
		}
	</style>
	${states.map((state) => `<path class="state${['02', '15', '72'].includes(state.fips) ? ' special' : ''}" data-state="${state.abbreviation}" d="${state.d}"><title>${escapeXml(state.name)}</title></path>`).join('\n\t')}
</svg>
`;
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, source, 'utf8');
console.log(`Generated ${states.length} map paths in ${path.relative(process.cwd(), output)}`);

function escapeXml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function readDbf(buffer) {
	const count = buffer.readUInt32LE(4);
	const headerLength = buffer.readUInt16LE(8);
	const recordLength = buffer.readUInt16LE(10);
	const fields = [];
	for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
		const end = buffer.indexOf(0, offset);
		fields.push({
			name: buffer.toString('ascii', offset, end < 0 ? offset + 11 : end),
			length: buffer[offset + 16]
		});
	}
	return Array.from({ length: count }, (_, index) => {
		let cursor = headerLength + index * recordLength + 1;
		const record = {};
		for (const field of fields) {
			record[field.name] = buffer.toString('utf8', cursor, cursor + field.length).trim();
			cursor += field.length;
		}
		return record;
	});
}

function readShapes(buffer) {
	const shapes = [];
	for (let offset = 100; offset + 8 <= buffer.length; ) {
		const contentBytes = buffer.readInt32BE(offset + 4) * 2;
		const start = offset + 8;
		const type = buffer.readInt32LE(start);
		if (type === 5) {
			const partCount = buffer.readInt32LE(start + 36);
			const pointCount = buffer.readInt32LE(start + 40);
			const parts = Array.from({ length: partCount }, (_, index) =>
				buffer.readInt32LE(start + 44 + index * 4)
			);
			const pointsStart = start + 44 + partCount * 4;
			const points = Array.from({ length: pointCount }, (_, index) => [
				buffer.readDoubleLE(pointsStart + index * 16),
				buffer.readDoubleLE(pointsStart + index * 16 + 8)
			]);
			shapes.push(
				parts.map((first, index) => points.slice(first, parts[index + 1] ?? points.length))
			);
		} else if (type !== 0) throw new Error(`Unsupported shapefile record type ${type}`);
		offset = start + contentBytes;
	}
	return shapes;
}

function shapePath(rings, fips) {
	return rings
		.map(
			(ring) =>
				ring
					.map(([longitude, latitude], index) => {
						const point = project(latitude, longitude > 0 ? longitude - 360 : longitude, fips);
						return `${index ? 'L' : 'M'}${round(point.x)} ${round(point.y)}`;
					})
					.join('') + 'Z'
		)
		.join('');
}

function project(latitude, longitude, fips) {
	if (fips === '02') return { x: 76 + (longitude + 170) * 4.2, y: 316 - (latitude - 50) * 4.1 };
	if (fips === '15') return { x: 205 + (longitude + 161) * 8, y: 337 - (latitude - 18) * 7 };
	if (fips === '72') return { x: 671 + (longitude + 68) * 12, y: 337 - (latitude - 17.5) * 10 };
	return { x: 84 + ((longitude + 125) / 59) * 634, y: 52 + ((50 - latitude) / 26) * 235 };
}
function round(value) {
	return Math.round(value * 10) / 10;
}
