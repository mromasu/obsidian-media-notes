# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Development build with esbuild
- `npm run build` - Production build (runs TypeScript type check then esbuild)
- `npm test` - Run Jest tests with jsdom environment
- `npm run bookmarklet` - Generate URL-encoded bookmarklet from bookmarklet.js using Bun
- `npm run bookmarklet-page` - Open dist/index.html to preview bookmarklet
- `npm run version` - Bump version and update manifest.json and versions.json

## Architecture Overview

This is an Obsidian plugin that enables users to see preview of a link by embedding YouTube players and web views directly in markdown notes. The plugin enables seamless capture and replay of insights from videos, podcasts, and lectures with timestamp-based navigation.

### Source Structure (`src/`)

- **main.tsx** - Main plugin class extending Obsidian's Plugin. Manages multiple player instances, handles commands (play/pause, seek, insert timestamp, speed control), and renders React components into markdown views with `preview_link` frontmatter
- **components/media-frame.tsx** - React component that renders YouTube player with custom overlay controls, progress bar, and animated feedback for user actions
- **app-context.tsx** - React context provider managing UI state (timestamp displays, seek animations, play/pause indicators) with EventEmitter communication
- **viewPlugin.ts** - CodeMirror extension that intercepts clicks on timestamp links (`[HH:MM:SS]()` format) to seek video playback
- **bookmarklet.js** - Browser bookmarklet script that extracts YouTube video info, pauses playback, and creates new Obsidian note via `obsidian://` URI scheme
- **convert-bookmarklet.ts** - Bun script that generates URL-encoded bookmarklet from bookmarklet.js for browser installation
- **__tests__/bookmarket.test.js** - Jest tests for bookmarklet title sanitization logic

### Key Features & Patterns

- **Preview Notes Format**: Markdown files with `preview_link` frontmatter property containing YouTube URLs or web links
- **One-Click Save**: Browser bookmarklet creates preview notes instantly from YouTube pages
- **Timestamp Navigation**: Click timestamp links `[HH:MM:SS]()` to jump to specific video moments
- **Persistent State**: Player positions saved in plugin settings by video ID for resume functionality
- **Hotkey Commands**: Configurable shortcuts for play/pause, seek forward/back, insert timestamp, speed control, toggle split view
- **Dual Layout Modes**: Vertical/horizontal split view with configurable player dimensions
- **Visual Feedback**: Animated overlays show current actions (play/pause, seek, speed changes)

### Plugin Integration Points

- Registers CodeMirror extensions for timestamp click handling
- Listens to workspace layout-change and metadata cache events to manage player lifecycle
- Renders React components into `.markdown-source-view` containers
- Provides settings tab with sliders, toggles, and color pickers for customization
- Uses EventEmitter pattern for communication between plugin commands and React UI

### Bookmarklet Workflow

The bookmarklet enables instant note creation from YouTube:
1. User clicks bookmarklet while watching YouTube video
2. Script pauses video and captures current timestamp
3. Creates timestamped URL with `t` parameter
4. Sanitizes video title for Obsidian filename compatibility
5. Opens new note via `obsidian://new` URI with pre-filled frontmatter using `preview_link` property and #Video tag