import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/build-centroids.mjs <2025_Gaz_zcta_national.txt>");
const source = await readFile(input, "utf8");
const rows = source.trim().split(/\r?\n/).slice(1).map(line => {
  const [zip, , , , , , latitude, longitude] = line.split("|");
  return [zip, Number(latitude), Number(longitude)];
});
const output = path.resolve("src/data/zcta-centroids.json");
await writeFile(output, `${JSON.stringify(rows)}\n`, "utf8");
console.log(`Wrote ${rows.length} ZCTA centroids to ${output}`);
