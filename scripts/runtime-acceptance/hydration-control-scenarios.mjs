import assert from 'node:assert/strict';

/** Checks browser-owned file identity and closed native controls after adoption. */
export async function checkEarlyNativeControls(page) {
	assert.deepEqual(
		await page.evaluate(() => [
			document.querySelector('#early-disclosure').open,
			document.querySelector('#early-dialog').open
		]),
		[false, false]
	);
	assert.deepEqual(
		await page.evaluate(() => ({
			retained: window.originalUpload === document.querySelector('#upload'),
			files: Array.from(document.querySelector('#upload').files, (file) => file.name)
		})),
		{ retained: true, files: ['proof.txt'] }
	);
}
