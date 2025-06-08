import React, { RefObject, useEffect, useRef } from "react";

interface VideoStreamProps {
  videoRef: RefObject<HTMLVideoElement>;
  streamUrl: string;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
}

const VideoStream: React.FC<VideoStreamProps> = ({
  videoRef,
  streamUrl,
  connectionStatus,
}) => {
  // Add a retry count
  const retryCountRef = useRef(0);

  // Set up video src when streamUrl changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Force hardware acceleration and display-related properties
    videoElement.style.transform = "translateZ(0)"; // Force hardware acceleration
    videoElement.style.backfaceVisibility = "hidden";
    videoElement.style.willChange = "transform";

    // Clear previous state if no streamUrl
    if (!streamUrl) {
      videoElement.removeAttribute("src");
      videoElement.load();
      retryCountRef.current = 0; // Reset retry count
      return;
    }

    // Set up video with the streamUrl
    console.log("Setting video source to:", streamUrl);

    // Set video properties directly
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.src = streamUrl;

    // Add more debugging events
    const eventNames = [
      "loadstart",
      "durationchange",
      "loadedmetadata",
      "loadeddata",
      "progress",
      "canplay",
      "canplaythrough",
      "play",
      "playing",
      "error",
    ];

    const listeners: { [key: string]: EventListener } = {};

    eventNames.forEach((name) => {
      const listener = () => {
        console.log(`Video event: ${name}`, {
          readyState: videoElement.readyState,
          networkState: videoElement.networkState,
          paused: videoElement.paused,
          currentTime: videoElement.currentTime,
          duration: videoElement.duration,
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          error: videoElement.error,
        });
      };
      listeners[name] = listener;
      videoElement.addEventListener(name, listener);
    });

    // Add timing to try playing
    let playAttempts = 0;
    const attemptPlay = () => {
      if (playAttempts >= 5) return;
      playAttempts++;

      console.log(`Attempting to play video (attempt ${playAttempts})`);

      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log("Video playing successfully"))
          .catch((err) => {
            console.error("Play error:", err);

            // Schedule another attempt
            setTimeout(attemptPlay, 1000);
          });
      }
    };

    // Try playing when ready
    if (videoElement.readyState >= 3) {
      // HAVE_FUTURE_DATA
      attemptPlay();
    } else {
      videoElement.addEventListener("canplay", attemptPlay, { once: true });
    }

    // Clean up event listeners
    return () => {
      eventNames.forEach((name) => {
        if (listeners[name]) {
          videoElement.removeEventListener(name, listeners[name]);
        }
      });
      videoElement.removeEventListener("canplay", attemptPlay);
    };
  }, [streamUrl]);

  // Separate useEffect for handling connection status changes
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !streamUrl || connectionStatus !== "connected") return;

    // Play when connection status changes to connected
    const playVideo = () => {
      console.log("Attempting to play video");
      videoElement
        .play()
        .then(() => console.log("Video playback started"))
        .catch((err) => {
          console.error("Play failed:", err);
          // One more retry with user interaction simulation
          setTimeout(() => {
            if (videoElement) {
              videoElement
                .play()
                .catch((e) => console.error("Final play attempt failed:", e));
            }
          }, 1000);
        });
    };

    // Short delay to ensure everything is ready
    const playTimer = setTimeout(playVideo, 500);

    return () => clearTimeout(playTimer);
  }, [connectionStatus, streamUrl]);

  return (
    <div className="video-stream">
      <div className="status-indicator">
        <div className={`status-dot ${connectionStatus}`}></div>
        <span className="status-text">{connectionStatus}</span>
      </div>

      <div
        className="video-wrapper"
        style={{
          position: "relative",
          width: "100%",
          height: "480px",
          backgroundColor: "#000",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
          }}
          className={`video-player ${
            connectionStatus === "connected" ? "active" : ""
          }`}
        />

        {connectionStatus === "connecting" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              color: "white",
              backgroundColor: "rgba(0,0,0,0.7)",
              zIndex: 2,
            }}
          >
            <div>Connecting to camera feed...</div>
          </div>
        )}

        {connectionStatus === "disconnected" && (
          <div className="placeholder-message">
            <p>Select 6 cameras to start streaming</p>
          </div>
        )}

        {connectionStatus === "error" && (
          <div className="error-overlay">
            <p>Error connecting to camera stream</p>
            <p>Please check that the proxy server is running</p>
          </div>
        )}
      </div>

      <div className="video-controls">
        <button
          onClick={() => {
            const video = videoRef.current;
            if (video) {
              video
                .play()
                .then(() => console.log("Manual play successful"))
                .catch((err) => console.error("Manual play failed:", err));
            }
          }}
          disabled={connectionStatus !== "connected"}
        >
          Play
        </button>
        <button
          onClick={() => videoRef.current?.pause()}
          disabled={connectionStatus !== "connected"}
        >
          Pause
        </button>
      </div>

      {/* Debug information */}
      {connectionStatus === "connected" && (
        <div
          style={{
            fontSize: "12px",
            color: "#666",
            padding: "8px",
          }}
        >
          <div>Format: {streamUrl.includes("webm") ? "WebM" : "MP4"}</div>
          <div>Status: {connectionStatus}</div>
          <div>
            Video size:{" "}
            {videoRef.current?.videoWidth}x{videoRef.current?.videoHeight}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoStream;
