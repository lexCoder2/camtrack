import React, { useEffect, useRef } from "react";

interface DetectionResult {
  class: string;
  score: number;
  bbox: [number, number, number, number];
  cameraIndex?: number;
}

interface VideoStreamProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamUrl: string;
  connectionStatus: string;
  detectionResults?: DetectionResult[];
  isDetecting?: boolean;
}

const VideoStream: React.FC<VideoStreamProps> = ({
  videoRef,
  streamUrl,
  connectionStatus,
  detectionResults = [],
  isDetecting = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw detection boxes on canvas
  useEffect(() => {
    if (
      !canvasRef.current ||
      !videoRef.current ||
      detectionResults.length === 0
    ) {
      // Clear canvas if no detections
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Set canvas size to match video
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Calculate scale factors
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw detection boxes
    detectionResults.forEach((detection) => {
      const [x, y, width, height] = detection.bbox;

      // Scale coordinates to canvas size
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;

      // Draw bounding box
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw label background
      const label = `${detection.class} ${Math.round(detection.score * 100)}%`;
      ctx.font = "16px Arial";
      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const textHeight = 20;

      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.fillRect(scaledX, scaledY - textHeight, textWidth + 10, textHeight);

      // Draw label text
      ctx.fillStyle = "#000";
      ctx.fillText(label, scaledX + 5, scaledY - 5);

      // Draw camera index if available
      if (detection.cameraIndex !== undefined) {
        const cameraLabel = `Cam ${detection.cameraIndex + 1}`;
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.fillRect(scaledX + scaledWidth - 50, scaledY, 50, 20);
        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.fillText(cameraLabel, scaledX + scaledWidth - 45, scaledY + 15);
      }
    });

    // Draw detection indicator
    if (isDetecting) {
      ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
      ctx.fillRect(0, 0, 100, 30);
      ctx.fillStyle = "#000";
      ctx.font = "14px Arial";
      ctx.fillText("🔍 DETECTING", 5, 20);
    }
  }, [detectionResults, isDetecting, videoRef]);

  return (
    <div className="video-stream-container" style={{ position: "relative" }}>
      <video
        ref={videoRef}
        src={streamUrl}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "70vh",
          objectFit: "contain",
        }}
      />

      {/* Detection overlay canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Status overlays */}
      {connectionStatus === "connecting" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            zIndex: 2,
          }}
        >
          <div>Connecting to camera feed...</div>
        </div>
      )}

      {connectionStatus === "disconnected" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            backgroundColor: "rgba(128, 128, 128, 0.7)",
            zIndex: 2,
          }}
        >
          <div>Camera feed disconnected</div>
        </div>
      )}

      {connectionStatus === "error" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            backgroundColor: "rgba(255, 0, 0, 0.7)",
            zIndex: 2,
          }}
        >
          <div>Connection error</div>
        </div>
      )}

      {/* Detection stats */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          background: "rgba(0, 0, 0, 0.7)",
          color: "white",
          padding: "5px 10px",
          borderRadius: "5px",
          fontSize: "12px",
          zIndex: 2,
        }}
      >
        People detected: {detectionResults.length}
      </div>
    </div>
  );
};

export default VideoStream;
