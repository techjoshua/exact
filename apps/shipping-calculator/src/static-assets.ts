import { stat } from 'node:fs/promises';

/** Describes the source file and optional content encoding selected for one static response. */
export type StaticRepresentation = {
	file: string;
	encoding?: 'br' | 'gzip';
};

/** Selects a precompressed representation without performing compression in the request path. */
export async function encodedRepresentation(
	file: string,
	acceptEncoding: string | undefined
): Promise<StaticRepresentation> {
	for (const candidate of acceptedRepresentations(acceptEncoding)) {
		const encodedFile = `${file}${candidate.suffix}`;
		try {
			await stat(encodedFile);
			return { file: encodedFile, encoding: candidate.encoding };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
	return { file };
}

/** Orders supported content encodings according to the request's explicit quality values. */
export function acceptedRepresentations(
	header: string | undefined
): Array<{ suffix: '.br' | '.gz'; encoding: 'br' | 'gzip'; quality: number }> {
	if (!header) return [];
	return header
		.split(',')
		.flatMap((item) => {
			const [name, ...parameters] = item.trim().toLowerCase().split(';');
			if (name !== 'br' && name !== 'gzip') return [];
			const encoding: 'br' | 'gzip' = name;
			const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
			const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
			if (!Number.isFinite(quality) || quality <= 0) return [];
			return [
				{
					suffix: encoding === 'br' ? ('.br' as const) : ('.gz' as const),
					encoding,
					quality
				}
			];
		})
		.sort((left, right) => right.quality - left.quality || (left.encoding === 'br' ? -1 : 1));
}

/** Returns the browser media type for a generated static source file. */
export function staticContentType(file: string): string {
	if (file.endsWith('.css')) return 'text/css; charset=utf-8';
	if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
	if (file.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
	return 'application/octet-stream';
}
