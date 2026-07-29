declare namespace chrome {
	namespace runtime {
		interface Port {
			name: string;
			sender?: { tab?: { id?: number } };
			onMessage: { addListener(listener: (message: any) => void): void };
			onDisconnect: { addListener(listener: () => void): void };
			postMessage(message: unknown): void;
			disconnect(): void;
		}
		const onConnect: { addListener(listener: (port: Port) => void): void };
		function connect(options: { name: string }): Port;
		function getURL(path: string): string;
	}
	namespace devtools {
		const inspectedWindow: {
			tabId: number;
			eval(
				expression: string,
				callback: (result: unknown, exception?: { isException?: boolean; value?: string }) => void
			): void;
		};
		const panels: {
			create(title: string, iconPath: string, pagePath: string): void;
			openResource(path: string, line: number, callback?: () => void): void;
		};
	}
}
