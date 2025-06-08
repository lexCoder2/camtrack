import { useState, useEffect, useRef, useCallback } from "react";
import config, { buildWebSocketUrl } from "../config";

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

export function useVideoStream(
  selectedCameras: number[] = [],
  isSelectionComplete: boolean = false
) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const bufferQueue = useRef<Uint8Array[]>([]);
  const processingQueue = useRef<boolean>(false);
  const isActiveRef = useRef<boolean>(true);
  const initialSegmentReceived = useRef<boolean>(false);

  // Enhanced error handling refs - reduced limits to prevent loops
  const chunkErrorCount = useRef<number>(0);
  const maxChunkErrors = config.detection.maxChunkErrors; // Reduced from 500
  const lastSuccessfulAppend = useRef<number>(Date.now());
  const bufferCleanupInterval = useRef<NodeJS.Timeout | null>(null);
  const videoRecoveryTimeout = useRef<NodeJS.Timeout | null>(null);
  const isRecoveringRef = useRef<boolean>(false); // Prevent recovery loops

  // Simplified buffer processing - no video error clearing during processing
  const processBuffer = useCallback(() => {
    if (
      processingQueue.current ||
      bufferQueue.current.length === 0 ||
      isRecoveringRef.current
    ) {
      return;
    }

    processingQueue.current = true;

    const processNextChunk = () => {
      if (bufferQueue.current.length === 0 || !isActiveRef.current) {
        processingQueue.current = false;
        return;
      }

      const data = bufferQueue.current.shift();
      if (!data) {
        processingQueue.current = false;
        return;
      }

      try {
        if (
          sourceBufferRef.current &&
          mediaSourceRef.current &&
          mediaSourceRef.current.readyState === "open" &&
          !sourceBufferRef.current.updating
        ) {
          sourceBufferRef.current.appendBuffer(data);
          lastSuccessfulAppend.current = Date.now();
          chunkErrorCount.current = 0; // Reset error count on success
        } else {
          // Re-queue chunk if buffer not ready (max 3 retries)
          if (data.byteLength > 0) {
            bufferQueue.current.unshift(data);
          }
          setTimeout(() => {
            processingQueue.current = false;
            processBuffer();
          }, 20);
        }
      } catch (error) {
        chunkErrorCount.current++;
        console.warn(
          `Chunk append error ${chunkErrorCount.current}/${maxChunkErrors}:`,
          error
        );

        // Just skip the corrupted chunk and continue - no recovery loops
        if (chunkErrorCount.current < maxChunkErrors) {
          setTimeout(processNextChunk, 50);
        } else {
          console.log("Too many chunk errors, clearing buffer and resetting");
          // Clear buffer and reset counters
          bufferQueue.current = [];
          chunkErrorCount.current = 0;
          processingQueue.current = false;
        }
      }
    };

    processNextChunk();
  }, []);

  // Simplified video error handler - no automatic recovery
  const handleVideoError = useCallback((event: Event) => {
    const video = videoRef.current;
    if (!video || !isActiveRef.current || isRecoveringRef.current) return;

    const error = video.error;

    console.warn("Video error occurred:", {
      currentTime: video.currentTime,
      error: error ? { code: error.code, message: error.message } : null,
      networkState: video.networkState,
      readyState: video.readyState,
      paused: video.paused,
    });

    // Don't attempt any recovery - just log the error
    // The stream will continue with available buffer
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // Buffer cleanup - simplified and safer
  const cleanupSourceBuffer = useCallback(() => {
    if (
      !sourceBufferRef.current ||
      !videoRef.current ||
      isRecoveringRef.current
    )
      return;

    try {
      const video = videoRef.current;
      const sourceBuffer = sourceBufferRef.current;

      // Only cleanup if safe to do so
      if (!video.error && !sourceBuffer.updating && video.buffered.length > 0) {
        const currentTime = video.currentTime;
        const bufferedStart = video.buffered.start(0);

        // Remove old buffer data (keep last 20 seconds)
        if (currentTime - bufferedStart > 20) {
          const removeEnd = Math.max(bufferedStart, currentTime - 10);
          sourceBuffer.remove(bufferedStart, removeEnd);
        }
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }, []);

  // Simplified MediaSource setup
  const setupMediaSource = useCallback(() => {
    if (!videoRef.current || !isActiveRef.current) return;

    try {
      // Clean up existing MediaSource
      if (mediaSourceRef.current) {
        try {
          mediaSourceRef.current.removeEventListener("sourceopen", () => {});
          mediaSourceRef.current.removeEventListener("error", () => {});
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      const objectURL = URL.createObjectURL(mediaSource);
      setStreamUrl(objectURL);

      const handleSourceOpen = () => {
        if (!isActiveRef.current || !mediaSourceRef.current) return;

        try {
          const sourceBuffer = mediaSourceRef.current.addSourceBuffer(
            'video/mp4; codecs="avc1.42E01E"'
          );
          sourceBufferRef.current = sourceBuffer;

          // Simple updateend handler
          const updateEndHandler = () => {
            if (!isActiveRef.current) return;

            processingQueue.current = false;

            // Continue processing queued chunks with delay
            if (bufferQueue.current.length > 0) {
              setTimeout(processBuffer, 50);
            }
          };

          sourceBuffer.addEventListener("updateend", updateEndHandler);

          // Simple error handler - no recovery attempts
          sourceBuffer.addEventListener("error", (event) => {
            console.warn("SourceBuffer error:", event);
            processingQueue.current = false;
          });

          // Start buffer cleanup interval (less frequent)
          if (bufferCleanupInterval.current) {
            clearInterval(bufferCleanupInterval.current);
          }
          bufferCleanupInterval.current = setInterval(
            cleanupSourceBuffer,
            30000
          ); // Every 30 seconds
        } catch (error) {
          console.error("Error setting up source buffer:", error);
          setConnectionStatus("error");
        }
      };

      mediaSource.addEventListener("sourceopen", handleSourceOpen);

      // Simple MediaSource error handler
      mediaSource.addEventListener("error", (event) => {
        console.warn("MediaSource error:", event);
        // Don't attempt recovery
      });
    } catch (error) {
      console.error("Error setting up MediaSource:", error);
      setConnectionStatus("error");
    }
  }, [processBuffer, cleanupSourceBuffer]);

  // Simplified WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      if (!isActiveRef.current) return;

      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);

        if (!initialSegmentReceived.current) {
          initialSegmentReceived.current = true;
          setConnectionStatus("connected");
        }

        // Prevent buffer overflow with smaller queue
        if (bufferQueue.current.length > 10) {
          bufferQueue.current.splice(0, 5); // Remove half the queue
        }

        bufferQueue.current.push(data);

        if (!processingQueue.current && !isRecoveringRef.current) {
          processBuffer();
        }
      }
    },
    [processBuffer]
  );

  // WebSocket connection using config
  const connectToWebSocket = useCallback(() => {
    if (!isActiveRef.current) return;

    const wsUrl = buildWebSocketUrl(selectedCameras, "mp4");

    setConnectionStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (!isActiveRef.current) return;
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ type: "request_init", codecType: "mp4" }));
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      if (isActiveRef.current) {
        setConnectionStatus("disconnected");
        // No automatic reconnection to prevent loops
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      if (isActiveRef.current) {
        setConnectionStatus("error");
      }
    };
  }, [handleWebSocketMessage]);

  // Simplified video element setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only add essential event listeners
    video.addEventListener("error", handleVideoError, true);

    // Simple canplay handler
    const handleCanPlay = () => {
      if (video.paused && !video.error && isActiveRef.current) {
        video.play().catch((e) => console.warn("Autoplay failed:", e));
      }
    };

    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("error", handleVideoError, true);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [handleVideoError]);

  // Main effect - simplified connection management
  useEffect(() => {
    isActiveRef.current = true;
    initialSegmentReceived.current = false;
    chunkErrorCount.current = 0;
    isRecoveringRef.current = false;

    const safeSelectedCameras = Array.isArray(selectedCameras)
      ? selectedCameras
      : [];

    if (!isSelectionComplete || safeSelectedCameras.length !== 6) {
      setConnectionStatus("disconnected");
      setStreamUrl("");

      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (bufferCleanupInterval.current) {
        clearInterval(bufferCleanupInterval.current);
        bufferCleanupInterval.current = null;
      }

      return;
    }

    setupMediaSource();
    connectToWebSocket();

    return () => {
      isActiveRef.current = false;
      isRecoveringRef.current = false;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (bufferCleanupInterval.current) {
        clearInterval(bufferCleanupInterval.current);
        bufferCleanupInterval.current = null;
      }

      if (videoRecoveryTimeout.current) {
        clearTimeout(videoRecoveryTimeout.current);
        videoRecoveryTimeout.current = null;
      }

      if (streamUrl) {
        URL.revokeObjectURL(streamUrl);
      }
    };
  }, [
    selectedCameras,
    isSelectionComplete,
    setupMediaSource,
    connectToWebSocket,
  ]);

  return {
    streamUrl,
    connectionStatus,
    videoRef,
  };
}
