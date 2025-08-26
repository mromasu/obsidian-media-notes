export type WebViewFrameOptionType = 'left' | 'center' | 'right'

export type WebViewFrameOption = {
    id: string
    title: string
    url: string
    profileKey?: string // Cookie persistence profile (similar to Chrome profile)
    position?: WebViewFrameOptionType
    userAgent?: string
    zoomFactor?: number // 0.5 = 50%, 1.0 = 100%, 2.0 = 200%, etc.
    css?: string // Custom CSS for the web view
    js?: string // Custom JavaScript for the web view
}

export const createEmptyWebViewOption = (): WebViewFrameOption => ({
    id: Math.random().toString(36).substring(2, 15),
    title: 'Web Preview',
    url: 'about:blank',
    profileKey: 'default',
    userAgent: '',
    zoomFactor: 1.0,
    css: '',
    js: ''
});

export const normalizeWebViewOption = (option: Partial<WebViewFrameOption>): WebViewFrameOption => {
    return {
        id: option.id || Math.random().toString(36).substring(2, 15),
        title: option.title || 'Web Preview',
        url: option.url || 'about:blank',
        profileKey: option.profileKey || 'default',
        position: option.position || 'center',
        userAgent: option.userAgent || '',
        zoomFactor: option.zoomFactor || 1.0,
        css: option.css || '',
        js: option.js || ''
    };
};

export const getDefaultUserAgent = (): string => {
    // Return a modern user agent string
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
};