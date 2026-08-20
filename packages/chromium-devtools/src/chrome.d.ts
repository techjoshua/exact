// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chrome runtime ports are untyped message buses; each owning protocol validates or narrows its channel payload.
type ChromeRuntimeMessage = any;

declare namespace chrome {
	namespace runtime {
		interface Port {
			name: string;
			sender?: { tab?: { id?: number } };
			onMessage: { addListener(listener: (message: ChromeRuntimeMessage) => void): void };
			onDisconnect: { addListener(listener: () => void): void };
			postMessage(message: unknown): void;
			disconnect(): void;
		}
		const onConnect: { addListener(listener: (port: Port) => void): void };
		const lastError: { message?: string } | undefined;
		function connect(options: { name: string }): Port;
		function getURL(path: string): string;
	}
	namespace devtools {
		interface Resource {
			url: string;
			getContent(callback: (content: string, encoding?: string) => void): void;
		}
		const inspectedWindow: {
			tabId: number;
			eval(
				expression: string,
				callback: (result: unknown, exception?: { isException?: boolean; value?: string }) => void
			): void;
			getResources(callback: (resources: Resource[]) => void): void;
		};
		const panels: {
			create(title: string, iconPath: string, pagePath: string): void;
			openResource(path: string, line: number, callback?: () => void): void;
		};
	}
}
