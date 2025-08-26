// Type declarations for Electron WebviewTag
declare namespace Electron {
    interface WebviewTag extends HTMLElement {
        // Core properties
        src: string;
        partition?: string;
        httpreferrer?: string;
        useragent?: string;
        disablewebsecurity?: string;
        allowpopups?: string;

        // Methods
        loadURL(url: string): Promise<void>;
        reload(): void;
        stop(): void;
        goBack(): void;
        goForward(): void;
        insertCSS(css: string): Promise<string>;
        executeJavaScript(code: string): Promise<any>;
        setZoomFactor(factor: number): void;
        getZoomFactor(): number;
        getURL(): string;
        isLoading(): boolean;
        isDevToolsOpened(): boolean;
        openDevTools(): void;
        closeDevTools(): void;

        // Event listeners
        addEventListener(event: string, listener: (event: any) => void): void;
        removeEventListener(event: string, listener: (event: any) => void): void;
    }
}

// Make WebviewTag available as a global type
declare var webview: Electron.WebviewTag;