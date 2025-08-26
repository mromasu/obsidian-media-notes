/// <reference path="../types/electron.d.ts" />
import { WebViewFrameOption } from './web-view-options';
// Import WebviewTag type from Electron for desktop environments
import WebviewTag = Electron.WebviewTag;

// Constants for repeated strings
const DEFAULT_URL = 'about:blank';
const GOOGLE_URL = 'https://google.com';
const MEDIA_NOTES_WEBVIEW_CLASS = 'media-notes-webview';

export const createWebviewTag = (params: Partial<WebViewFrameOption>, onReady?: () => void, parentDoc?: Document): WebviewTag => {
    // Create a new webview tag using the parent document context
    const webviewTag = (parentDoc || document).createElement('webview') as unknown as WebviewTag;

    // Set attributes for the webview tag with cookie persistence
    webviewTag.setAttribute('partition', 'persist:' + (params.profileKey || 'default'));
    webviewTag.setAttribute('src', params.url ?? DEFAULT_URL);
    webviewTag.setAttribute('httpreferrer', params.url ?? GOOGLE_URL);
    webviewTag.setAttribute('crossorigin', 'anonymous');
    webviewTag.setAttribute('allowpopups', 'true');
    webviewTag.setAttribute('disablewebsecurity', 'true');
    webviewTag.classList.add(MEDIA_NOTES_WEBVIEW_CLASS);

    // Set user agent if provided
    if (params.userAgent && params.userAgent !== '') {
        webviewTag.setAttribute('useragent', params.userAgent);
    }

    // Handle DOM ready event for initialization
    webviewTag.addEventListener('dom-ready', async () => {
        try {
            // Set zoom factor if provided
            if (params.zoomFactor && params.zoomFactor !== 1.0) {
                webviewTag.setZoomFactor(params.zoomFactor);
            }

            // Inject custom CSS if provided
            if (params?.css) {
                await webviewTag.insertCSS(params.css);
            }

            // Execute custom JavaScript if provided
            if (params?.js) {
                await webviewTag.executeJavaScript(params.js);
            }

            // Call ready callback
            onReady?.call(null);
        } catch (error) {
            console.error('Error during webview initialization:', error);
            // Still call onReady even if some initialization failed
            onReady?.call(null);
        }
    });

    // Handle load failures
    webviewTag.addEventListener('did-fail-load', (event: any) => {
        console.error('Webview failed to load:', event);
    });

    // Handle navigation events for debugging
    webviewTag.addEventListener('did-start-loading', () => {
        // Optional: Add loading indicator
    });

    webviewTag.addEventListener('did-stop-loading', () => {
        // Optional: Remove loading indicator
    });

    return webviewTag;
};