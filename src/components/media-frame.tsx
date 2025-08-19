import { useAppContext } from "../app-context";
import { formatTimestamp } from "../main";
import * as React from "react";
import YouTube, { YouTubeEvent, YouTubeProps } from "react-youtube";
import { CSSTransition } from "react-transition-group";
import { YoutubeTranscript } from "../youtube-transcript";
import type { TranscriptLine } from "../types";

// Types for enhanced transcript
interface TranscriptSentence {
	text: string;
	startOffset: number;
	endOffset: number;
	originalIndex: number;
}

interface TranscriptParagraph {
	sentences: TranscriptSentence[];
	startOffset: number;
	endOffset: number;
}

export const getVideoId = (url: string) => {
	const urlParams = new URLSearchParams(new URL(url).search);
	return urlParams.get("v");
};

// Helper function to split text into sentences
const splitIntoSentences = (text: string): string[] => {
	// Split on sentence-ending punctuation followed by whitespace or end of string
	// Also handle common abbreviations and edge cases
	const sentences = text
		.replace(/([.!?])\s+/g, "$1|")
		.split("|")
		.map(s => s.trim())
		.filter(s => s.length > 0);
	
	return sentences;
};

// Function to group transcript lines into paragraphs of 3 sentences each
const groupTranscriptIntoParagraphs = (transcriptLines: TranscriptLine[]): TranscriptParagraph[] => {
	const sentences: TranscriptSentence[] = [];
	
	// First, convert each transcript line into sentences
	transcriptLines.forEach((line, lineIndex) => {
		const lineSentences = splitIntoSentences(line.text);
		
		lineSentences.forEach((sentenceText, sentenceIndex) => {
			// Calculate timing - distribute line duration across sentences
			const sentenceDuration = line.duration / lineSentences.length;
			const sentenceStartOffset = line.offset + (sentenceIndex * sentenceDuration);
			
			sentences.push({
				text: sentenceText,
				startOffset: sentenceStartOffset,
				endOffset: sentenceStartOffset + sentenceDuration,
				originalIndex: lineIndex
			});
		});
	});
	
	// Group sentences into paragraphs of 3
	const paragraphs: TranscriptParagraph[] = [];
	
	for (let i = 0; i < sentences.length; i += 3) {
		const paragraphSentences = sentences.slice(i, i + 3);
		
		paragraphs.push({
			sentences: paragraphSentences,
			startOffset: paragraphSentences[0].startOffset,
			endOffset: paragraphSentences[paragraphSentences.length - 1].endOffset
		});
	}
	
	return paragraphs;
};

export const MediaFrame: React.FC<{
	mediaLink: string;
	ytRef: React.RefObject<YouTube>;
	initSeconds: number;
	autoplay?: boolean;
}> = ({ mediaLink, ytRef, initSeconds, autoplay }) => {
	const videoId = getVideoId(mediaLink);
	if (!videoId) return null;
	const opts: YouTubeProps["opts"] = {
		playerVars: {
			// this needs to be not undefined to work
			start: initSeconds,
			autoplay: autoplay ? 1 : 0,
		},
	};
	// const intervalRef = React.useRef<number | undefined>(undefined);

	// const currentTime = ytRef.current?.getCurrentTime();
	const [maxTime, setMaxTime] = React.useState<number>(0);
	const [currentTimestamp, setCurrentTimestamp] = React.useState<number>(0);

	// Transcript state
	const [transcript, setTranscript] = React.useState<TranscriptLine[]>([]);
	const [transcriptLoading, setTranscriptLoading] = React.useState<boolean>(false);
	const [transcriptError, setTranscriptError] = React.useState<string | null>(null);
	
	// Enhanced transcript state
	const [transcriptParagraphs, setTranscriptParagraphs] = React.useState<TranscriptParagraph[]>([]);
	const [currentParagraphIndex, setCurrentParagraphIndex] = React.useState<number>(-1);
	const [currentSentenceIndex, setCurrentSentenceIndex] = React.useState<number>(-1);
	const transcriptContainerRef = React.useRef<HTMLDivElement>(null);

	// Calculate the width of the progress bar as a percentage
	const progressBarWidth = (currentTimestamp / maxTime) * 100;

	// create a ref to store the setInterval function
	const intervalRef = React.useRef<number | null>(null);

	const [hideProgressBar, setHideProgressBar] = React.useState(true);

	const updateTimestamp = () => {
		ytRef.current
			?.getInternalPlayer()
			?.getCurrentTime()
			.then((time) => {
				setCurrentTimestamp(time);
			});
	};

	const onStateChange: YouTubeProps["onStateChange"] = (
		event: YouTubeEvent<number>
	) => {
		// keep the current timestamp state up to date
		const handleAsyncCode = async () => {
			const state = event.data;
			// if it was paused and now playing, set the current timestamp and making a polling setTimeout to check the player's current time and set the current timestamp every 1s
			if (state === 1) {
				updateTimestamp();
				const interval = window.setInterval(() => {
					updateTimestamp();
				}, 1000);
				intervalRef.current = interval;
				setHideProgressBar(false);
			}
			// if it was playing and is now paused, remove the polling interval and set
			if ((state === 2 || state === 0) && intervalRef.current) {
				window.clearInterval(intervalRef.current);
				setHideProgressBar(true);
			}
		};
		void handleAsyncCode();
	};

	React.useEffect(() => {
		return () => {
			if (intervalRef.current) {
				window.clearInterval(intervalRef.current);
			}
		};
	}, []);

	const context = useAppContext();

	React.useEffect(() => {
		if (context?.showTimestamp) {
			updateTimestamp();
		}
	}, [context?.showTimestamp]);

	// Fetch transcript when component mounts
	React.useEffect(() => {
		const fetchTranscript = async () => {
			try {
				setTranscriptLoading(true);
				setTranscriptError(null);
				
				const transcriptData = await YoutubeTranscript.getTranscript(mediaLink, {
					lang: context?.settings?.transcriptLanguage || "en"
				});
				setTranscript(transcriptData.lines);
				
				// Generate paragraph structure
				const paragraphs = groupTranscriptIntoParagraphs(transcriptData.lines);
				setTranscriptParagraphs(paragraphs);
			} catch (error) {
				console.error("Failed to fetch transcript:", error);
				setTranscriptError(error instanceof Error ? error.message : "Failed to fetch transcript");
			} finally {
				setTranscriptLoading(false);
			}
		};

		if (videoId && context?.settings?.showTranscript) {
			fetchTranscript();
		}
	}, [mediaLink, videoId, context?.settings?.showTranscript, context?.settings?.transcriptLanguage]);

	// Handle transcript timestamp clicks
	const handleTranscriptClick = (offsetMs: number) => {
		const offsetSeconds = offsetMs / 1000;
		ytRef.current?.getInternalPlayer()?.seekTo(offsetSeconds, true);
	};

	// Update current paragraph and sentence based on video position
	const updateCurrentPosition = React.useCallback(() => {
		if (transcriptParagraphs.length === 0) return;
		
		const currentTimeMs = currentTimestamp * 1000;
		let newParagraphIndex = -1;
		let newSentenceIndex = -1;
		
		// Find current paragraph
		for (let i = 0; i < transcriptParagraphs.length; i++) {
			const paragraph = transcriptParagraphs[i];
			if (currentTimeMs >= paragraph.startOffset && currentTimeMs <= paragraph.endOffset) {
				newParagraphIndex = i;
				
				// Find current sentence within paragraph
				for (let j = 0; j < paragraph.sentences.length; j++) {
					const sentence = paragraph.sentences[j];
					if (currentTimeMs >= sentence.startOffset && currentTimeMs <= sentence.endOffset) {
						newSentenceIndex = j;
						break;
					}
				}
				break;
			}
		}
		
		// Update indices if they changed
		if (newParagraphIndex !== currentParagraphIndex) {
			setCurrentParagraphIndex(newParagraphIndex);
		}
		if (newSentenceIndex !== currentSentenceIndex) {
			setCurrentSentenceIndex(newSentenceIndex);
		}
	}, [transcriptParagraphs, currentTimestamp, currentParagraphIndex, currentSentenceIndex]);

	// Update position when timestamp changes
	React.useEffect(() => {
		updateCurrentPosition();
	}, [updateCurrentPosition]);

	// Auto-scroll to current paragraph within transcript container only
	React.useEffect(() => {
		if (currentParagraphIndex >= 0 && transcriptContainerRef.current) {
			const container = transcriptContainerRef.current;
			const currentParagraphElement = container.querySelector(
				`[data-paragraph-index="${currentParagraphIndex}"]`
			) as HTMLElement;
			
			if (currentParagraphElement) {
				// Dynamically get the current container dimensions
				const containerHeight = container.clientHeight;
				const containerScrollHeight = container.scrollHeight;
				const containerPadding = 16; // Account for padding
				
				// Only scroll if content overflows the container
				if (containerScrollHeight > containerHeight) {
					// Get element position using getBoundingClientRect for accurate positioning
					const containerRect = container.getBoundingClientRect();
					const elementRect = currentParagraphElement.getBoundingClientRect();
					const elementHeight = currentParagraphElement.offsetHeight;
					
					// Calculate element's current position relative to the container's viewport
					const elementRelativeTop = elementRect.top - containerRect.top + container.scrollTop;
					
					// Calculate target scroll position to center the paragraph in the visible area (with slight offset)
					const yOffset = -100; // Offset by 50px higher than center
					const targetScrollTop = elementRelativeTop - (containerHeight / 2) + (elementHeight / 2) - yOffset;
					
					// Clamp to valid scroll range based on current container size  
					const maxScrollTop = Math.max(0, containerScrollHeight - containerHeight);
					const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
					
					// Only animate scroll if there's a meaningful distance to scroll
					const currentScrollTop = container.scrollTop;
					const scrollDistance = clampedScrollTop - currentScrollTop;
					
					if (Math.abs(scrollDistance) > 10) { // Only scroll if distance > 10px
						// Smooth scroll with requestAnimationFrame for better performance
						const duration = 300; // ms
						let startTime: number | null = null;
						
						const animateScroll = (currentTime: number) => {
							if (startTime === null) startTime = currentTime;
							const elapsed = currentTime - startTime;
							const progress = Math.min(elapsed / duration, 1);
							
							// Easing function for smooth animation
							const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
							const easedProgress = easeInOutQuad(progress);
							
							container.scrollTop = currentScrollTop + scrollDistance * easedProgress;
							
							if (progress < 1) {
								requestAnimationFrame(animateScroll);
							}
						};
						
						requestAnimationFrame(animateScroll);
					}
				}
			}
		}
	}, [currentParagraphIndex]);

	const seekBackRef = React.useRef(null);
	const seekForwardRef = React.useRef(null);
	const playRef = React.useRef(null);
	const pauseRef = React.useRef(null);
	const speedRef = React.useRef(null);

	return (
		<div className="media-top-container">
			<div className="media-container">
				{/* @ts-ignore TS2607 */}
				<YouTube
					ref={ytRef}
					className="youtube-iframe"
					iframeClassName={`youtube-iframe`}
					videoId={videoId}
					opts={opts}
					onStateChange={onStateChange}
					onReady={async (event: YouTubeEvent) => {
						const duration = await event.target.getDuration();
						setMaxTime(duration);
					}}
				/>
				<CSSTransition
					nodeRef={playRef}
					in={context?.showPlay}
					timeout={15000}
					classNames="playpause-icon"
					mountOnEnter={true}
					unmountOnExit={true}
				>
					<div className="playpause-container">
						<div ref={playRef} className="play-icon">
							<svg
								viewBox="0 0 50 50"
								height="45"
								width="45"
								xmlns="http://www.w3.org/2000/svg"
							>
								<polygon
									fill="white"
									points="15,10 40,25 15,40"
								></polygon>
							</svg>
						</div>
					</div>
				</CSSTransition>
				<CSSTransition
					nodeRef={pauseRef}
					in={context?.showPause}
					timeout={15000}
					classNames="playpause-icon"
					mountOnEnter={true}
					unmountOnExit={true}
				>
					<div className="playpause-container">
						<div ref={pauseRef} className="pause-icon">
							<svg
								viewBox="0 0 50 50"
								height="50"
								width="50"
								xmlns="http://www.w3.org/2000/svg"
							>
								<rect
									fill="white"
									height="30"
									width="7"
									y="10"
									x="14"
								></rect>
								<rect
									fill="white"
									height="30"
									width="7"
									y="10"
									x="29"
								></rect>
							</svg>
						</div>
					</div>
				</CSSTransition>
				<CSSTransition
					nodeRef={seekBackRef}
					in={context?.showSeekBackwards}
					timeout={500}
					classNames="seek-icon"
					mountOnEnter={true}
					unmountOnExit={true}
				>
					<div ref={seekBackRef} className="seek-backwards">
						<div className="round">
							<div id="cta">
								<span className="mn-arrow bounceAlphaBack primera back "></span>
								<span className="mn-arrow bounceAlphaBack segunda back "></span>
								<div className="text">
									{context?.settings?.seekSeconds}s
								</div>
							</div>
						</div>
					</div>
				</CSSTransition>
				<CSSTransition
					nodeRef={seekForwardRef}
					in={context?.showSeekForward}
					timeout={500}
					classNames="seek-icon"
					mountOnEnter={true}
					unmountOnExit={true}
				>
					<div ref={seekForwardRef} className="seek-forwards">
						<div className="round">
							<div id="cta">
								<span className="mn-arrow bounceAlpha segunda next "></span>
								<span className="mn-arrow bounceAlpha primera next "></span>
								<div className="text">
									{context?.settings?.seekSeconds}s
								</div>
							</div>
						</div>
					</div>
				</CSSTransition>
				<CSSTransition
					nodeRef={speedRef}
					in={context?.showSpeed}
					timeout={1000}
					// This class is used for the transition classes (e.g speed-icon-enter)
					classNames="speed-icon"
					mountOnEnter={true}
					unmountOnExit={true}
				>
					<div ref={speedRef} className="speed-icon">
						{context?.currentSpeed}x
					</div>
				</CSSTransition>
				<div
					className={`progress-bar-container ${
						hideProgressBar ||
						!context?.settings?.displayProgressBar
							? "hidden"
							: ""
					}`}
				>
					<div
						className={`timestamp ${
							!(
								context?.settings?.displayTimestamp ||
								context?.showTimestamp
							)
								? "hidden"
								: ""
						}`}
					>
						<div className="timestamp-inner">
							{formatTimestamp(currentTimestamp)}
						</div>
					</div>
					<div
						className={`progress-bar`}
						style={{
							width: `${progressBarWidth}%`,
							backgroundColor:
								context?.settings?.progressBarColor,
						}}
					></div>
				</div>
			</div>
			{context?.settings?.showTranscript && (
				<div className="transcript-container" ref={transcriptContainerRef}>
					{transcriptLoading && (
						<div className="transcript-loading">Loading transcript...</div>
					)}
					{transcriptError && (
						<div className="transcript-error">
							Failed to load transcript: {transcriptError}
						</div>
					)}
					{transcriptParagraphs.length > 0 && !transcriptLoading && (
						<div className="transcript-content">
							{transcriptParagraphs.map((paragraph, paragraphIndex) => (
								<div 
									key={paragraphIndex}
									className={`transcript-paragraph ${
										paragraphIndex === currentParagraphIndex ? 'current-paragraph' : ''
									}`}
									data-paragraph-index={paragraphIndex}
								>
									{paragraph.sentences.map((sentence, sentenceIndex) => (
										<span 
											key={`${paragraphIndex}-${sentenceIndex}`}
											className={`transcript-sentence ${
												paragraphIndex === currentParagraphIndex && 
												sentenceIndex === currentSentenceIndex ? 'current-sentence' : ''
											}`}
										>
											<span className="transcript-text">{sentence.text}</span>
											{sentenceIndex < paragraph.sentences.length - 1 && ' '}
										</span>
									))}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
