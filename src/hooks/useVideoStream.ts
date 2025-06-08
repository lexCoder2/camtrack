import { useState, useEffect, useRef } from "react";
import muxjs from "mux.js";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

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
  const isActiveRef = useRef<boolean>(true); // Track if component is still mounted
  const initialSegmentReceived = useRef<boolean>(false);
  // Add references for handlers and mux.js transmuxer
  const updateEndHandlerRef = useRef<(() => void) | null>(null);
  const transmuxerRef = useRef<any>(null);

  // Function to check if codec is supported
  const isCodecSupported = (mimeType: string): boolean => {
    return MediaSource.isTypeSupported(mimeType);
  };

  useEffect(() => {
    isActiveRef.current = true;
    initialSegmentReceived.current = false;

    // Safety check to ensure selectedCameras is an array
    const safeSelectedCameras = Array.isArray(selectedCameras)
      ? selectedCameras
      : [];

    if (!isSelectionComplete || safeSelectedCameras.length !== 6) {
      setConnectionStatus("disconnected");
      setStreamUrl(""); // Clear the URL when no valid selection

      // Clean up any existing WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      return;
    }

    // Try different MIME types for codec compatibility
    const possibleMimeTypes = [
      'video/mp4; codecs="avc1.42E01E"', // Standard H.264
      'video/mp4; codecs="avc1.42001E"', // Baseline profile
      'video/mp4; codecs="avc1.640028"', // High profile
      "video/mp4", // Generic MP4
      'video/webm; codecs="vp8"', // WebM with VP8
      'video/webm; codecs="vp9"', // WebM with VP9
      "video/webm", // Generic WebM
    ];

    // Find the first supported MIME type
    let supportedMimeType = possibleMimeTypes.find(isCodecSupported);

    if (!supportedMimeType) {
      console.error("No supported video codec found for MediaSource");
      setConnectionStatus("error");
      return;
    }

    console.log(`Using codec: ${supportedMimeType}`);

    // Set up MediaSource
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    // Create object URL from MediaSource
    const objectUrl = URL.createObjectURL(mediaSource);
    setStreamUrl(objectUrl);

    // Initialize mux.js transmuxer based on codec type
    const isWebM = supportedMimeType.includes("webm");
    const codecType = isWebM ? "webm" : "mp4";

    if (isWebM) {
      // For WebM: Use mux.js WebM tooling if needed
      console.log("Using WebM format");
      // No specific WebM transmuxer in mux.js
    } else {
      // For MP4: Create MP4 transmuxer
      console.log("Using MP4 format with mux.js transmuxer");
      try {
        const transmuxer = new muxjs.mp4.Transmuxer({
          keepOriginalTimestamps: true,
          remux: true,
        });

        transmuxerRef.current = transmuxer;

        transmuxer.on("data", (segment: any) => {
          if (
            !isActiveRef.current ||
            !sourceBufferRef.current ||
            !mediaSourceRef.current
          )
            return;

          try {
            // Get the init segment if this is the first data
            if (!initialSegmentReceived.current) {
              const initSegment = new Uint8Array(segment.initSegment);
              if (initSegment.length > 0) {
                console.log("Got init segment from mux.js", initSegment.length);

                if (!sourceBufferRef.current.updating) {
                  sourceBufferRef.current.appendBuffer(initSegment);
                  initialSegmentReceived.current = true;
                } else {
                  bufferQueue.current.unshift(initSegment);
                }
              }
            }

            // Handle the media segment
            const data = new Uint8Array(segment.data);
            if (data.length > 0) {
              if (sourceBufferRef.current.updating) {
                bufferQueue.current.push(data);
              } else {
                try {
                  sourceBufferRef.current.appendBuffer(data);
                } catch (e) {
                  console.error("Error appending processed segment:", e);
                  bufferQueue.current.push(data);
                }
              }
            }
          } catch (e) {
            console.error("Error handling transmuxed segment:", e);
          }
        });

        transmuxer.on("error", (error: any) => {
          console.error("Transmuxer error:", error);
        });
      } catch (e) {
        console.error("Failed to initialize mux.js transmuxer:", e);
      }
    }

    const handleSourceOpen = () => {
      // Check if component is still mounted
      if (!isActiveRef.current) return;

      setConnectionStatus("connecting");

      try {
        // Create a SourceBuffer with the supported MIME type
        const sourceBuffer = mediaSource.addSourceBuffer(supportedMimeType);
        sourceBufferRef.current = sourceBuffer;

        // Set mode to 'segments' for better compatibility
        if ("mode" in sourceBuffer) {
          sourceBuffer.mode = "segments";
        }

        // Process buffered data when the buffer is updated
        const onUpdateEnd = () => {
          processingQueue.current = false;
          processBuffer();
        };

        sourceBuffer.addEventListener("updateend", onUpdateEnd);
        updateEndHandlerRef.current = onUpdateEnd;

        // Connect to WebSocket after MediaSource is ready
        connectToWebSocket(safeSelectedCameras, codecType);
      } catch (error) {
        console.error("Error setting up MediaSource:", error);
        setConnectionStatus("error");
      }
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);

    return () => {
      isActiveRef.current = false;
      initialSegmentReceived.current = false;

      // Clean up on unmount or when dependencies change
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Clean up mux.js transmuxer
      if (transmuxerRef.current) {
        try {
          transmuxerRef.current.reset();
          transmuxerRef.current = null;
        } catch (e) {
          console.error("Error cleaning up transmuxer:", e);
        }
      }

      // Clean up source buffer event listeners
      const sourceBuffer = sourceBufferRef.current;
      if (sourceBuffer && updateEndHandlerRef.current) {
        try {
          sourceBuffer.removeEventListener(
            "updateend",
            updateEndHandlerRef.current
          );
        } catch (e) {
          console.error("Error removing updateend listener:", e);
        }
      }

      // Close the media source if it's open
      if (
        mediaSourceRef.current &&
        mediaSourceRef.current.readyState === "open"
      ) {
        try {
          mediaSourceRef.current.endOfStream();
        } catch (e) {
          console.error("Error ending media stream:", e);
        }
      }

      // Clean up the URL
      if (streamUrl) {
        URL.revokeObjectURL(streamUrl);
      }

      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
      updateEndHandlerRef.current = null;
      bufferQueue.current = [];
      setConnectionStatus("disconnected");
    };
  }, [selectedCameras, isSelectionComplete]);

  // Implement the connectToWebSocket function with mux.js processing
  const connectToWebSocket = (
    cameraIds: number[],
    codecType: string = "mp4"
  ) => {
    if (!isActiveRef.current) return;

    const cameraIdsParam = cameraIds.join(",");
    // Include codec type in the WebSocket URL
    const wsUrl = `ws://localhost:3001/?cameraIds=${cameraIdsParam}&codecType=${codecType}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (!isActiveRef.current) {
          ws.close();
          return;
        }

        console.log("WebSocket connection opened");
        ws.send(JSON.stringify({ type: "request_init", codecType }));
      };

      // Add these helper functions at the beginning of your hook
      const formatHexByte = (byte: number): string => {
        return byte.toString(16).padStart(2, "0");
      };

      const logBufferStart = (buffer: Uint8Array, length: number = 16): void => {
        const hexValues = Array.from(
          buffer.slice(0, Math.min(length, buffer.length))
        )
          .map(formatHexByte)
          .join(" ");
        console.log(`Buffer starts with: ${hexValues}`);
      };

      // Update the ws.onmessage handler
      ws.onmessage = (event) => {
        if (!isActiveRef.current) return;

        if (event.data instanceof ArrayBuffer) {
          // Handle binary video data
          const data = new Uint8Array(event.data);

          // Log some bytes from the first few chunks for debugging
          if (!initialSegmentReceived.current) {
            const chunkSize = data.length;
            console.log(`Received chunk of size: ${chunkSize} bytes`);
            logBufferStart(data, 32); // Log first 32 bytes

            // Set connection status to connected after receiving some data
            setTimeout(() => {
              if (isActiveRef.current) {
                initialSegmentReceived.current = true;
                setConnectionStatus("connected");
              }
            }, 100);
          }

          // Process the data
          try {
            if (
              sourceBufferRef.current &&
              mediaSourceRef.current &&
              mediaSourceRef.current.readyState === "open"
            ) {
              if (!sourceBufferRef.current.updating) {
                sourceBufferRef.current.appendBuffer(data);
              } else {
                bufferQueue.current.push(data);
              }
            } else {
              bufferQueue.current.push(data);
            }
          } catch (err) {
            console.error("Error appending buffer:", err);
            bufferQueue.current.push(data);
          }

          // Make sure the queue processing starts
          if (!processingQueue.current) {
            processBuffer();
          }
        } else {
          // Handle non-binary messages
          try {
            const message = JSON.parse(event.data);
            console.log("WebSocket message:", message);
          } catch (e) {
            console.log("Received non-JSON message:", event.data);
          }
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
        if (isActiveRef.current) {
          setConnectionStatus("error");
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (isActiveRef.current) {
          setConnectionStatus("error");
        }
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      if (isActiveRef.current) {
        setConnectionStatus("error");
      }
    }
  };

  // Process buffer data
  const processBuffer = () => {
    if (
      !isActiveRef.current ||
      !sourceBufferRef.current ||
      !mediaSourceRef.current ||
      mediaSourceRef.current.readyState !== "open" ||
      sourceBufferRef.current.updating ||
      bufferQueue.current.length === 0
    ) {
      return;
    }

    processingQueue.current = true;
    try {
      const data = bufferQueue.current.shift();
      if (data) {
        sourceBufferRef.current.appendBuffer(data);
        // updateend event will clear processingQueue.current
      } else {
        processingQueue.current = false;
      }
    } catch (error) {
      console.error("Error processing buffer:", error);
      processingQueue.current = false;
    }
  };

  return {
    streamUrl,
    connectionStatus,
    videoRef,
  };
}
