import { WebViewFrameOption } from './web-view-options';

export const createIframe = (params: Partial<WebViewFrameOption>, onReady?: () => void): HTMLIFrameElement => {
    const iframe = document.createElement('iframe');

    // Set security and functionality attributes
    iframe.setAttribute('allowpopups', '');
    iframe.setAttribute('credentialless', 'true');
    iframe.setAttribute('crossorigin', 'anonymous');
    iframe.setAttribute('src', params.url ?? 'about:blank');
    
    // Comprehensive sandbox policy for security while allowing necessary functionality
    iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation');
    
    // Allow various media and interaction features
    iframe.setAttribute('allow', 'encrypted-media; fullscreen; oversized-images; picture-in-picture; sync-xhr; geolocation');
    
    // Add CSS class for styling
    iframe.classList.add('media-notes-webview-iframe');

    // Handle load event
    iframe.addEventListener('load', () => {
        onReady?.call(null);

        // Inject custom CSS if provided
        if (params?.css) {
            try {
                const style = document.createElement('style');
                style.textContent = params.css;
                iframe.contentDocument?.head.appendChild(style);
            } catch (error) {
                console.warn('Failed to inject custom CSS into iframe:', error);
            }
        }

        // Inject custom JavaScript if provided
        if (params?.js) {
            try {
                const script = document.createElement('script');
                script.textContent = params.js;
                iframe.contentDocument?.head.appendChild(script);
            } catch (error) {
                console.warn('Failed to inject custom JavaScript into iframe:', error);
            }
        }

        // Set zoom factor if provided (CSS transform method for iframe)
        if (params?.zoomFactor && params.zoomFactor !== 1.0) {
            try {
                const zoomStyle = document.createElement('style');
                zoomStyle.textContent = `
                    body {
                        zoom: ${params.zoomFactor};
                        transform-origin: 0 0;
                    }
                `;
                iframe.contentDocument?.head.appendChild(zoomStyle);
            } catch (error) {
                console.warn('Failed to set zoom factor for iframe:', error);
            }
        }
    });

    // Handle errors
    iframe.addEventListener('error', (error) => {
        console.error('Iframe load error:', error);
    });

    return iframe;
};