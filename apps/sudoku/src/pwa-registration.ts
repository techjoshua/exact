/**
 * Registers the app-shell service worker after the initial page load.
 *
 * Registration is production-only so local development always observes the
 * current compiler output without a cached build masking changes.
 */
export function registerSudokuServiceWorker(): void {
	if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

	window.addEventListener(
		'load',
		() => {
			void navigator.serviceWorker
				.register(`${import.meta.env.BASE_URL}service-worker.js`, {
					scope: import.meta.env.BASE_URL
				})
				.catch((error: unknown) => {
					console.warn('Sudoku Atelier could not enable offline play.', error);
				});
		},
		{ once: true }
	);
}
