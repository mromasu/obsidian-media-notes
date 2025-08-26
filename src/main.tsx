import { createRoot } from "react-dom/client";
import { MediaFrame, getVideoId, isYouTubeUrl } from "./components/media-frame";
import { AppProvider } from "./app-context";
import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	View,
	parseYaml,
} from "obsidian";
import * as React from "react";
import YouTube from "react-youtube";
import { createClickHandlerPlugin } from "./viewPlugin";
import { EventEmitter } from "events";

export interface CssRule {
	url: string;
	css: string;
}

export interface MediaNotesPluginSettings {
	seekSeconds: number;
	verticalPlayerHeight: number;
	horizontalPlayerWidth: number;
	timestampTemplate: string;
	timestampOffsetSeconds: number;
	backgroundColor: string;
	progressBarColor: string;
	displayProgressBar: boolean;
	displayTimestamp: boolean;
	pauseOnTimestampInsert: boolean;
	defaultSplitMode: "Horizontal" | "Vertical";
	showTranscript: boolean;
	transcriptLanguage: string;
	// Web view settings
	webViewUserAgent: string;
	webViewZoomFactor: number;
	webViewProfileKey: string;
	urlCssRules: CssRule[];
	mediaData: {
		[id: string]: {
			mediaLink: string;
			lastUpdated: string;
			lastTimestampSeconds: number;
		};
	};
}

const DEFAULT_SETTINGS: MediaNotesPluginSettings = {
	seekSeconds: 10,
	verticalPlayerHeight: 40,
	horizontalPlayerWidth: 40,
	defaultSplitMode: "Vertical",
	pauseOnTimestampInsert: false,
	displayProgressBar: true,
	displayTimestamp: true,
	timestampOffsetSeconds: 6,
	backgroundColor: "#000000",
	progressBarColor: "#FF0000",
	timestampTemplate: "[{ts}]({link})\n",
	showTranscript: true,
	transcriptLanguage: "en",
	// Web view defaults
	webViewUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	webViewZoomFactor: 1.0,
	webViewProfileKey: "media-notes-web",
	urlCssRules: [],
	mediaData: {},
};

const mediaNotesContainerClass = "media-notes-container";
const mediaParentContainerVerticalClass = "media-container-parent-vertical";

export const getMatchingCssForUrl = (url: string, cssRules: CssRule[]): string => {
	const matchingRules = cssRules.filter(rule => 
		rule.url.trim() && url.toLowerCase().startsWith(rule.url.toLowerCase().trim())
	);
	return matchingRules.map(rule => rule.css).join('\n\n');
};

export const formatTimestamp = (timestamp: number | undefined) => {
	if (timestamp === undefined) return "";
	const hours = Math.floor(timestamp / 3600);
	const minutes = Math.floor((timestamp - hours * 3600) / 60);
	const seconds = Math.floor(timestamp - hours * 3600 - minutes * 60);
	const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
	const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
	return `${
		hours > 0 ? hours + ":" : ""
	}${formattedMinutes}:${formattedSeconds}`;
};

const convertTimestampToSeconds = (timestamp: string) => {
	const timestampParts = timestamp.split(":").map(Number);
	let seconds = 0;
	if (timestampParts.length === 3) {
		seconds += timestampParts[0] * 3600;
		seconds += timestampParts[1] * 60;
		seconds += timestampParts[2];
	} else if (timestampParts.length === 2) {
		seconds += timestampParts[0] * 60;
		seconds += timestampParts[1];
	} else {
		seconds += timestampParts[0];
	}
	return seconds;
};

const getMediaLinkFromFrontmatter = (frontmatter: Record<string, string>) => {
	return frontmatter["media_link"] || frontmatter["media"];
};

export default class MediaNotesPlugin extends Plugin {
	settings: MediaNotesPluginSettings;

	players: {
		[id: string]: {
			ytRef: React.RefObject<YouTube>;
			mediaLink: string;
			eventEmitter: EventEmitter;
		};
	};

	getActiveViewYoutubePlayer = (view: View) => {
		// const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const existingPlayer = view.containerEl.querySelector(
			"." + mediaNotesContainerClass
		);
		if (!existingPlayer) return;
		const playerId = existingPlayer.getAttribute("data-player-id") ?? "";
		const player = this.players[playerId];
		if (!player) return null;
		return player;
	};

	// saves the timestamp of the player into settings, by media link
	savePlayerTimestamp = (playerId: string) => {
		const player = this.players[playerId];
		if (!player) return;
		
		// Only save timestamps for YouTube videos
		if (isYouTubeUrl(player.mediaLink)) {
			player.ytRef.current?.internalPlayer
				?.getCurrentTime()
				.then((timestamp: number) => {
					const mediaId = getVideoId(player.mediaLink);
					if (!mediaId) return;
					this.settings.mediaData[mediaId] = {
						mediaLink: player.mediaLink,
						lastUpdated: new Date().toISOString(),
						lastTimestampSeconds: timestamp,
					};
					this.saveSettings();
					this.loadSettings();
				});
		}
	};

	renderPlayerInView = (markdownView: MarkdownView) => {
		// @ts-ignore TS2339
		const frontmatter = (parseYaml(markdownView.rawFrontmatter) ??
			{}) as Record<string, string>;
		// if there's a media_link
		if (frontmatter && getMediaLinkFromFrontmatter(frontmatter)) {
			const container = markdownView.containerEl;
			const existingPlayerComponent = container.querySelector(
				"." + mediaNotesContainerClass
			);

			if (existingPlayerComponent) {
				const playerId =
					existingPlayerComponent.getAttribute("data-player-id") ??
					"";
				const player = this.players[playerId];
				// If a player state object exists for this media link, don't re-render
				if (
					player &&
					player.mediaLink ===
						getMediaLinkFromFrontmatter(frontmatter)
				) {
					return;
				}
				// remove the existing player
				existingPlayerComponent.remove();
				this.savePlayerTimestamp(playerId);
				delete this.players[playerId];
			}

			const div = document.createElement("div");
			const uniqueId =
				Math.random().toString(36).substring(2, 15) +
				Math.random().toString(36).substring(2, 15);

			div.className = mediaNotesContainerClass;
			// name is important - matches data-player-id in getActiveViewYoutubePlayer
			div.dataset.playerId = uniqueId;
			div.style.background = this.settings.backgroundColor;
			const markdownSourceview = container.querySelector(
				".markdown-source-view"
			);
			if (this.settings.defaultSplitMode === "Vertical") {
				div.style.width = this.settings.horizontalPlayerWidth + "%";
				container.classList.add(mediaParentContainerVerticalClass);
			} else {
				container.classList.remove(mediaParentContainerVerticalClass);
				div.style.height = this.settings.verticalPlayerHeight + "%";
			}

			if (!markdownSourceview) return;
			markdownSourceview.prepend(div);

			const mediaLink = getMediaLinkFromFrontmatter(frontmatter);
			const ytRef = React.createRef<YouTube>();
			const eventEmitter = new EventEmitter();
			this.players[uniqueId] = {
				ytRef,
				mediaLink: mediaLink,
				eventEmitter,
			};

			// Initialize timestamp and autoplay for YouTube videos only
			let initSeconds = 0;
			let autoplay = false;
			
			if (isYouTubeUrl(mediaLink)) {
				const mediaId = getVideoId(mediaLink);
				const mediaData =
					(mediaId && this.settings.mediaData[mediaId]) ||
					this.settings.mediaData[mediaLink];

				// extract the url param ts from the media link for YouTube
				try {
					const mediaLinkUrl = new URL(mediaLink);
					const mediaLinkParams = new URLSearchParams(mediaLinkUrl.search);
					const mediaLinkTs = mediaLinkParams.get("t");
					initSeconds =
						mediaData?.lastTimestampSeconds ?? (mediaLinkTs ? Number(mediaLinkTs) : 0);

					// If the initial seconds came from the mediaLink, autoplay
					if (mediaLinkTs && Number(initSeconds) === Number(mediaLinkTs)) {
						autoplay = true;
					}
				} catch (error) {
					console.warn("Error parsing YouTube URL:", error);
					initSeconds = 0;
				}
			}

			const root = createRoot(div);
			root.render(
				<>
					<AppProvider
						settingsParam={this.settings}
						eventEmitter={eventEmitter}
					>
						<MediaFrame
							mediaLink={String(mediaLink)}
							ytRef={ytRef}
							initSeconds={Math.round(initSeconds)}
							autoplay={autoplay}
						/>
					</AppProvider>
				</>
			);
		} else {
			// if there's no media_link, cleanup
			const container = markdownView.containerEl;
			// cleanup existing players, and save timestamp
			const div = container.querySelector("." + mediaNotesContainerClass);
			if (div) {
				// unmount
				const playerId = div.getAttribute("data-player-id") ?? "";
				this.savePlayerTimestamp(playerId);
				delete this.players[playerId];
				div.remove();
			}
		}
	};

	handleTimestampClick = (timestamp: string): boolean | undefined => {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;
		const player = this.getActiveViewYoutubePlayer(activeView);
		if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;

		const seconds = convertTimestampToSeconds(timestamp);
		player.ytRef.current?.getInternalPlayer()?.seekTo(seconds, true);
		player.eventEmitter.emit("handleAction", {
			type: "timestampClick",
		});
		return true;
	};

	async onload() {
		this.registerEditorExtension([
			createClickHandlerPlugin(this.handleTimestampClick),
		]);
		await this.loadSettings();

		this.players = {};

		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const view = leaf.view as MarkdownView;
			this.renderPlayerInView(view);
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "insert-media-timestamp",
			name: "Insert Timestamp",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const timestamp =
					await player.ytRef.current?.internalPlayer?.getCurrentTime();
				if (!timestamp) return;
				const offsetTimestamp =
					timestamp - this.settings.timestampOffsetSeconds >= 0
						? timestamp - this.settings.timestampOffsetSeconds
						: 0;
				const formattedTimestamp = formatTimestamp(offsetTimestamp);
				const timestampTemplate = this.settings.timestampTemplate;
				let timestampSnippet = timestampTemplate.replace(
					"{ts}",
					formattedTimestamp
				);
				const videoUrl =
					await player.ytRef.current?.internalPlayer?.getVideoUrl();

				if (videoUrl) {
					// for some reason, the t= param is wrong in the videoUrl from getVidelUrl. fix it
					const fixedVideoUrl = new URL(videoUrl);
					fixedVideoUrl.searchParams.set(
						"t",
						Math.floor(offsetTimestamp).toString()
					);
					timestampSnippet = timestampSnippet.replace(
						"{link}",
						`${fixedVideoUrl}`
					);
				}
				timestampSnippet = timestampSnippet.replace(/\\n/g, "\n");
				editor.replaceSelection(timestampSnippet);
				if (this.settings.pauseOnTimestampInsert) {
					const player = this.getActiveViewYoutubePlayer(view);
					if (!player || !player.ytRef) return;
					const playerState =
						await player.ytRef.current?.internalPlayer?.getPlayerState();
					if (playerState === YouTube.PlayerState.PLAYING) {
						player.ytRef.current?.getInternalPlayer()?.pauseVideo();
						player.eventEmitter.emit("handleAction", {
							type: "pause",
						});
						return;
					}
				}
			},
		});

		this.addCommand({
			id: "toggle-play-pause",
			name: "Play/Pause",
			editorCallback: async (_editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const playerState =
					await player.ytRef.current?.internalPlayer?.getPlayerState();
				if (playerState === YouTube.PlayerState.PLAYING) {
					player.ytRef.current?.getInternalPlayer()?.pauseVideo();
					player.eventEmitter.emit("handleAction", {
						type: "pause",
					});
					return;
				}
				player.ytRef.current?.getInternalPlayer()?.playVideo();
				player.eventEmitter.emit("handleAction", {
					type: "play",
				});
			},
		});

		this.addCommand({
			id: "toggle-horizontal-view",
			name: "Toggle horizontal/vertical split",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player) return; // This command works for both YouTube and web views
				console.log("toggle horizontal view");
				const container = view.containerEl;
				const existingPlayer = view.containerEl.querySelector(
					"." + mediaNotesContainerClass
				) as HTMLElement;
				if (
					container.classList.contains(
						mediaParentContainerVerticalClass
					)
				) {
					if (existingPlayer) {
						existingPlayer.style.height =
							this.settings.verticalPlayerHeight + "%";
						existingPlayer.style.width = "100%";
					}
					container.classList.remove(
						mediaParentContainerVerticalClass
					);
				} else {
					if (existingPlayer) {
						existingPlayer.style.width =
							this.settings.horizontalPlayerWidth + "%";
						existingPlayer.style.height = "100%";
					}
					container.classList.add(mediaParentContainerVerticalClass);
				}
			},
		});

		this.addCommand({
			id: "seek-forward",
			name: "Fast Forward",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const currentTime =
					await player.ytRef.current?.internalPlayer?.getCurrentTime();
				if (!currentTime) return;
				const newTime = currentTime + this.settings.seekSeconds;
				player.ytRef.current
					?.getInternalPlayer()
					?.seekTo(newTime, true);
				player.eventEmitter.emit("handleAction", {
					type: "seekForward",
				});
			},
		});

		this.addCommand({
			id: "seek-backwards",
			name: "Rewind",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const currentTime =
					await player.ytRef.current?.internalPlayer?.getCurrentTime();
				if (!currentTime) return;
				const newTime = currentTime - this.settings.seekSeconds;
				player.ytRef.current
					?.getInternalPlayer()
					?.seekTo(newTime, true);
				player.eventEmitter.emit("handleAction", {
					type: "seekBackwards",
				});
				// player.ytRef.current?.getInternalPlayer()?.showVideoInfo();
				// TODO: this isn't working - don't think i can simulate a mousemove to the iframe
				const existingPlayer = view.containerEl.querySelector(
					".media-notes-container .youtube-iframe"
				);
				existingPlayer?.dispatchEvent(new Event("mousemove"));
			},
		});

		this.addCommand({
			id: "speed-up",
			name: "Speed up",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const internalPlayer =
					player.ytRef.current?.getInternalPlayer();
				if (!internalPlayer) return;
				const playbackRates =
					await internalPlayer.getAvailablePlaybackRates();
				const currentRate = await internalPlayer.getPlaybackRate();
				const currentRateIndex = playbackRates.indexOf(currentRate);
				const nextRateIndex =
					currentRateIndex + 1 < playbackRates.length
						? currentRateIndex + 1
						: currentRateIndex;
				const nextRate = playbackRates[nextRateIndex];
				internalPlayer.setPlaybackRate(nextRate);
				player.eventEmitter.emit("handleAction", {
					type: "setSpeed",
					speed: nextRate,
				});
			},
		});

		this.addCommand({
			id: "slow-down",
			name: "Slow down",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const player = this.getActiveViewYoutubePlayer(view);
				if (!player || !player.ytRef || !isYouTubeUrl(player.mediaLink)) return;
				const internalPlayer =
					player.ytRef.current?.getInternalPlayer();
				if (!internalPlayer) return;
				const playbackRates =
					await internalPlayer.getAvailablePlaybackRates();
				const currentRate = await internalPlayer.getPlaybackRate();
				const currentRateIndex = playbackRates.indexOf(currentRate);
				const nextRateIndex =
					currentRateIndex - 1 >= 0 ? currentRateIndex - 1 : 0;
				const nextRate = playbackRates[nextRateIndex];
				internalPlayer.setPlaybackRate(nextRate);
				player.eventEmitter.emit("handleAction", {
					type: "setSpeed",
					speed: nextRate,
				});
			},
		});

		this.addCommand({
			id: "toggle-media-container",
			name: "Toggle Media Container",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const container = view.containerEl;
				const existingPlayer = container.querySelector(
					"." + mediaNotesContainerClass
				) as HTMLElement;
				
				if (!existingPlayer) return;
				
				if (existingPlayer.classList.contains("media-notes-container-collapsed")) {
					existingPlayer.classList.remove("media-notes-container-collapsed");
				} else {
					existingPlayer.classList.add("media-notes-container-collapsed");
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!markdownView) {
					// since we don't have the view anymore, trigger a save on all the players in state
					Object.keys(this.players).forEach((id) => {
						this.savePlayerTimestamp(id);
					});
					return;
				}
				this.renderPlayerInView(markdownView);
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				const frontmatter =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (frontmatter && getMediaLinkFromFrontmatter(frontmatter)) {
					// technically this may not be the same view as the file that changed
					const markdownView =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!markdownView) return;
					this.renderPlayerInView(markdownView);
				}
			})
		);

		// TODO: this doesn't work yet, its for Reading mode
		// this.registerMarkdownPostProcessor(
		// 	(el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		// 		el.querySelectorAll(".external-link").forEach(
		// 			(link: HTMLAnchorElement) => {
		// 				link.addEventListener("click", (event: MouseEvent) => {
		// 					event.preventDefault();
		// 					// Your custom logic here
		// 					console.log(
		// 						"Intercepted cm-link click:",
		// 						link.href
		// 					);
		// 				});
		// 			}
		// 		);
		// 	}
		// );
	}

	onunload() {
		// if there's an active view, save the timestamp (for development hot reloading)
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;
		const container = activeView.containerEl;

		// cleanup existing players, and save timestamp
		const div = container.querySelector("." + mediaNotesContainerClass);
		if (div) {
			// unmount
			const playerId = div.getAttribute("data-player-id") ?? "";
			console.log("save timestamp before reloading!");
			this.savePlayerTimestamp(playerId);
			delete this.players[playerId];
			div.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		Object.values(this.players).forEach((player) => {
			player.eventEmitter.emit("settingsUpdated", this.settings);
		});
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: MediaNotesPlugin;

	constructor(app: App, plugin: MediaNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Default split view")
			.setDesc(
				"Vertical or horizontal split view. Defaults to horizontal."
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						Vertical: "Vertical",
						Horizontal: "Horizontal",
					})
					.setValue(this.plugin.settings.defaultSplitMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultSplitMode = value as
							| "Vertical"
							| "Horizontal";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Rewind & fast forward seconds")
			.setDesc("Number of seconds to rewind/fast forward")
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.seekSeconds)
					.onChange(async (value) => {
						this.plugin.settings.seekSeconds = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Player height (%) in horizontal-split mode")
			.setDesc(
				"The height of the player as a percentage of the viewport in horizontal-split mode."
			)
			.addSlider((slider) =>
				slider
					.setLimits(5, 95, 5)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.verticalPlayerHeight)
					.onChange(async (value) => {
						this.plugin.settings.verticalPlayerHeight = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Player width (%) in vertical-split mode")
			.setDesc(
				"The width of the player as a percentage of the viewport in vertical-split mode."
			)
			.addSlider((slider) =>
				slider
					.setLimits(5, 95, 5)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.horizontalPlayerWidth)
					.onChange(async (value) => {
						this.plugin.settings.horizontalPlayerWidth = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Timestamp offset seconds")
			.setDesc(
				"Number of seconds in the past to offset by when inserting the timestamp."
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.timestampOffsetSeconds)
					.onChange(async (value) => {
						this.plugin.settings.timestampOffsetSeconds = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Timestamp template")
			.setDesc(
				"Markdown template for inserted timestamp. Variables: {ts} is timestamp, {link} is a timestamped url, \\n is new line. Example: \\n- [{ts}]({link}) "
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.timestampTemplate)
					.onChange(async (value) => {
						this.plugin.settings.timestampTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Video player background")
			.setDesc(
				"Background color for the video player. e.g #dddddd or rgba(0, 0, 0, 0.8)"
			)
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.backgroundColor)
					.onChange(async (value) => {
						this.plugin.settings.backgroundColor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show progress bar")
			.setDesc("Display a progress bar for the elapsed time")
			.addToggle((val) =>
				val
					.setValue(this.plugin.settings.displayProgressBar)
					.onChange(async (value) => {
						this.plugin.settings.displayProgressBar = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Progress bar color")
			.setDesc("Color of the progress bar below the video")
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.progressBarColor)
					.onChange(async (value) => {
						this.plugin.settings.progressBarColor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Always display current timestamp")
			.setDesc(
				"Always display the current timestamp. Default behavior is to only show it when seeking."
			)
			.addToggle((val) =>
				val
					.setValue(this.plugin.settings.displayTimestamp)
					.onChange(async (value) => {
						this.plugin.settings.displayTimestamp = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Pause media when inserting timestamp")
			.setDesc(
				"If enabled, the media will pause when a timestamp is inserted"
			)
			.addToggle((val) =>
				val
					.setValue(this.plugin.settings.pauseOnTimestampInsert)
					.onChange(async (value) => {
						this.plugin.settings.pauseOnTimestampInsert = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show transcript")
			.setDesc(
				"Display YouTube video transcript below the player"
			)
			.addToggle((val) =>
				val
					.setValue(this.plugin.settings.showTranscript)
					.onChange(async (value) => {
						this.plugin.settings.showTranscript = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Transcript language")
			.setDesc(
				"Preferred language code for transcript (e.g., en, es, fr, de)"
			)
			.addText((text) =>
				text
					.setPlaceholder("en")
					.setValue(this.plugin.settings.transcriptLanguage)
					.onChange(async (value) => {
						this.plugin.settings.transcriptLanguage = value || "en";
						await this.plugin.saveSettings();
					})
			);

		// Add heading for web view settings
		containerEl.createEl("h3", { text: "Web View Settings (for non-YouTube links)" });

		new Setting(containerEl)
			.setName("Web view user agent")
			.setDesc(
				"User agent string for web views. Leave empty for default."
			)
			.addText((text) =>
				text
					.setPlaceholder("Mozilla/5.0...")
					.setValue(this.plugin.settings.webViewUserAgent)
					.onChange(async (value) => {
						this.plugin.settings.webViewUserAgent = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Web view zoom factor")
			.setDesc(
				"Zoom level for web views (0.5 = 50%, 1.0 = 100%, 2.0 = 200%)"
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.25, 3.0, 0.25)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.webViewZoomFactor)
					.onChange(async (value) => {
						this.plugin.settings.webViewZoomFactor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Web view profile key")
			.setDesc(
				"Cookie storage profile for web views. Change to isolate cookies between different contexts."
			)
			.addText((text) =>
				text
					.setPlaceholder("media-notes-web")
					.setValue(this.plugin.settings.webViewProfileKey)
					.onChange(async (value) => {
						this.plugin.settings.webViewProfileKey = value || "media-notes-web";
						await this.plugin.saveSettings();
					})
			);

		// CSS Rules section
		const cssRulesHeader = containerEl.createEl("h3", { text: "CSS Rules for URLs" });
		cssRulesHeader.style.marginTop = "2em";

		const cssRulesDesc = containerEl.createEl("p", { 
			text: "Add custom CSS rules for specific URL patterns. URLs will match any URL that begins with the provided pattern."
		});
		cssRulesDesc.style.color = "var(--text-muted)";
		cssRulesDesc.style.fontSize = "0.9em";

		// Add new CSS rule button
		new Setting(containerEl)
			.setName("Add CSS Rule")
			.setDesc("Add a new URL pattern and CSS rule")
			.addButton((button) => {
				button
					.setButtonText("+ Add Rule")
					.setClass("mod-cta")
					.onClick(async () => {
						this.plugin.settings.urlCssRules.push({ url: "", css: "" });
						await this.plugin.saveSettings();
						this.display(); // Refresh the display
					});
			});

		// Display existing CSS rules
		this.plugin.settings.urlCssRules.forEach((rule, index) => {
			const ruleContainer = containerEl.createDiv();
			ruleContainer.style.border = "1px solid var(--background-modifier-border)";
			ruleContainer.style.borderRadius = "8px";
			ruleContainer.style.padding = "16px";
			ruleContainer.style.marginBottom = "16px";
			ruleContainer.style.backgroundColor = "var(--background-secondary)";

			// URL input
			new Setting(ruleContainer)
				.setName("URL Pattern")
				.setDesc("URL prefix to match (e.g., https://github.com/)")
				.addText((text) =>
					text
						.setPlaceholder("https://example.com/")
						.setValue(rule.url)
						.onChange(async (value) => {
							this.plugin.settings.urlCssRules[index].url = value;
							await this.plugin.saveSettings();
						})
				);

			// CSS textarea
			new Setting(ruleContainer)
				.setName("CSS Rules")
				.setDesc("CSS code to inject into matching pages")
				.addTextArea((text) => {
					text
						.setPlaceholder("/* Enter CSS rules here */\nbody { background-color: #f0f0f0; }")
						.setValue(rule.css)
						.onChange(async (value) => {
							this.plugin.settings.urlCssRules[index].css = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.style.minHeight = "100px";
					text.inputEl.style.fontFamily = "monospace";
				});

			// Delete button
			new Setting(ruleContainer)
				.addButton((button) => {
					button
						.setButtonText("Delete Rule")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.urlCssRules.splice(index, 1);
							await this.plugin.saveSettings();
							this.display(); // Refresh the display
						});
				});
		});
	}
}
