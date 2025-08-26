/// <reference path="../types/electron.d.ts" />
import * as React from "react";
import { Platform } from "obsidian";
import { WebViewFrameOption, getDefaultUserAgent } from "../utils/web-view-options";
import { createIframe } from "../utils/create-iframe";
import { createWebviewTag } from "../utils/create-webview-tag";
import WebviewTag = Electron.WebviewTag;

interface WebViewProps {
    url: string;
    title?: string;
    profileKey?: string;
    userAgent?: string;
    zoomFactor?: number;
    css?: string;
    js?: string;
    onReady?: () => void;
}

export const WebView: React.FC<WebViewProps> = ({
    url,
    title = "Web Preview",
    profileKey = "default",
    userAgent,
    zoomFactor = 1.0,
    css = "",
    js = "",
    onReady
}) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const frameRef = React.useRef<WebviewTag | HTMLIFrameElement | null>(null);
    const [isReady, setIsReady] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    // Determine if we should use iframe (mobile) or webview (desktop)
    const useIframe = Platform.isMobileApp;

    // Create the web view frame options
    const frameOptions: Partial<WebViewFrameOption> = {
        url,
        title,
        profileKey,
        userAgent: userAgent || getDefaultUserAgent(),
        zoomFactor,
        css,
        js
    };

    React.useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        
        // Clear any existing content
        container.innerHTML = '';
        setIsReady(false);
        setError(null);
        setIsLoading(true);

        const handleReady = () => {
            setIsReady(true);
            setIsLoading(false);
            onReady?.();
        };

        const handleError = (errorMsg: string) => {
            setError(errorMsg);
            setIsLoading(false);
        };

        try {
            if (useIframe) {
                // Create iframe for mobile
                const iframe = createIframe(frameOptions, handleReady);
                
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                
                iframe.addEventListener('error', () => {
                    handleError('Failed to load iframe');
                });

                container.appendChild(iframe);
                frameRef.current = iframe;
            } else {
                // Create webview tag for desktop
                const webview = createWebviewTag(frameOptions, handleReady);
                
                webview.style.width = '100%';
                webview.style.height = '100%';
                
                // Add error handling for webview
                webview.addEventListener('did-fail-load', (event: any) => {
                    handleError(`Failed to load: ${event.errorDescription || 'Unknown error'}`);
                });

                container.appendChild(webview as unknown as HTMLElement);
                frameRef.current = webview;
            }
        } catch (err) {
            console.error('Error creating web view:', err);
            handleError('Failed to create web view');
        }

        // Cleanup function
        return () => {
            if (frameRef.current) {
                try {
                    frameRef.current.remove();
                } catch (err) {
                    console.warn('Error removing web view frame:', err);
                }
                frameRef.current = null;
            }
        };
    }, [url, profileKey, userAgent, zoomFactor, css, js, useIframe]);

    // Method to reload the web view
    const reload = () => {
        if (!frameRef.current) return;

        try {
            if (frameRef.current instanceof HTMLIFrameElement) {
                frameRef.current.contentWindow?.location.reload();
            } else {
                (frameRef.current as WebviewTag).reload();
            }
        } catch (err) {
            console.error('Error reloading web view:', err);
        }
    };

    // Method to navigate to home URL
    const goHome = () => {
        if (!frameRef.current) return;

        try {
            if (frameRef.current instanceof HTMLIFrameElement) {
                frameRef.current.src = url;
            } else {
                (frameRef.current as WebviewTag).loadURL(url);
            }
        } catch (err) {
            console.error('Error navigating to home:', err);
        }
    };

    return (
        <div className="media-notes-webview-container">
            {/* Web view container - always present */}
            <div 
                ref={containerRef} 
                className={`webview-frame-container ${isReady ? 'ready' : ''} ${error ? 'error' : ''}`}
                style={{ 
                    width: '100%', 
                    height: '100%',
                    display: error ? 'none' : 'block'
                }}
            />

            {/* Loading overlay */}
            {isLoading && (
                <div className="webview-loading-overlay">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading {title}...</div>
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="webview-error-overlay">
                    <div className="error-message">
                        <strong>Failed to load website</strong>
                        <p>{error}</p>
                        <button onClick={() => window.location.reload()} className="retry-button">
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Control buttons (only show when ready and no error) */}
            {isReady && !error && (
                <div className="webview-controls">
                    <button 
                        onClick={reload} 
                        className="webview-control-button" 
                        title="Reload"
                        aria-label="Reload webpage"
                    >
                        ⟲
                    </button>
                    <button 
                        onClick={goHome} 
                        className="webview-control-button" 
                        title="Home"
                        aria-label="Go to home page"
                    >
                        🏠
                    </button>
                </div>
            )}
        </div>
    );
};