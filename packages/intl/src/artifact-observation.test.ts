import { it } from 'vitest';
import { registerIntlArtifacts, snapshotIntlArtifacts } from './artifacts.js';
import { verifyIntlArtifactObservations } from '../../component-composition-corpus/test-support/intl-protocol-journey.mjs';

it('keeps artifact observations ordinary without changing accepted private generations', () => {
	verifyIntlArtifactObservations({ registerIntlArtifacts, snapshotIntlArtifacts });
});

function checkReadonlyTypes(snapshot: ReturnType<typeof snapshotIntlArtifacts>) {
	// @ts-expect-error Artifact observations retain TypeScript readonly diagnostics.
	snapshot.revision = 0;
	// @ts-expect-error Snapshot lists retain TypeScript readonly diagnostics.
	snapshot.descriptors.length = 0;
}
void checkReadonlyTypes;
