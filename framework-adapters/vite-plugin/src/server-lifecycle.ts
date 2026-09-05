type ExactClosable = {
	once(event: 'close', listener: () => void): unknown;
};

/** Connects both Vite server owners to one idempotent plugin disposal operation. */
export function attachExactViteServerDisposal(
	server: { httpServer?: ExactClosable; watcher?: ExactClosable },
	dispose: () => void | Promise<void>
): void {
	server.httpServer?.once('close', () => void dispose());
	server.watcher?.once('close', () => void dispose());
}
