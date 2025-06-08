const express = require("express");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const app = express();
const PORT = 3001;

// Store active transcoders for cleanup
const activeTranscoders = new Map();

// RTSP to WebM transcoder setup for H.264 (less memory intensive)
function createTranscoder(cameraIds, wsClient, codecType = "mp4") {
  // cameraIds: array of up to 6 camera IDs
  const rtspUrls = cameraIds.map(
    (id) =>
      `rtsp://admin:pass1111@192.168.6.160:554/cam/realmonitor?channel=${id}&subtype=0`
  );

  // Build FFmpeg input arguments with lower resolution for memory optimization
  const inputArgs = rtspUrls.flatMap((url) => [
    "-rtsp_transport",
    "tcp",
    "-i",
    url,
  ]);

  // Add scale filter to reduce memory usage - scale each input to 480x270 before stacking
  const scaleFilters = cameraIds
    .map((_, i) => `[${i}:v]scale=480:270[v${i}]`)
    .join(";");

  // xstack filter using the scaled inputs
  const scaledInputs = cameraIds.map((_, i) => `[v${i}]`).join("");
  const xstackFilter = `${scaleFilters};${scaledInputs}xstack=inputs=${cameraIds.length}:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[v]`;

  // Adjust output format based on codecType
  let outputArgs = [];

  if (codecType === "webm") {
    // WebM output with VP8
    outputArgs = [
      "-map",
      "[v]",
      "-c:v",
      "libvpx",
      "-b:v",
      "1M", // Lower bitrate for better compatibility
      "-crf",
      "25", // Better quality (lower is better)
      "-deadline",
      "realtime",
      "-cpu-used",
      "8", // Maximum speed setting
      "-auto-alt-ref",
      "0", // Disable alt refs for low-latency
      "-lag-in-frames",
      "0", // No lag frames for low-latency
      "-bufsize",
      "600k", // Small buffer for low-latency
      "-pix_fmt",
      "yuv420p", // Most compatible pixel format
      "-an", // No audio
      "-f",
      "webm",
      "-cluster_size_limit",
      "2M", // Smaller clusters
      "-cluster_time_limit",
      "5000", // 5 seconds max per cluster
      "-dash",
      "1", // Enable DASH-compatible output
      "pipe:1",
    ];
  } else {
    // Modified MP4 output for better mux.js compatibility
    outputArgs = [
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-profile:v",
      "baseline", // This ensures compatibility with most browsers
      "-level",
      "3.1", // Updated level for better compatibility
      "-b:v",
      "1M", // Higher bitrate for better visibility
      "-maxrate",
      "1M",
      "-bufsize",
      "2M",
      "-g",
      "15", // GOP size (keyframe interval)
      "-keyint_min",
      "15", // Minimum keyframe interval
      "-sc_threshold",
      "0", // Scene cut threshold (disable scene detection)
      "-r",
      "15", // Frame rate
      "-an", // No audio
      "-pix_fmt",
      "yuv420p", // Most compatible pixel format
      "-tune",
      "zerolatency",
      "-threads",
      "4",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof+faststart",
      "pipe:1",
    ];
  }

  const ffmpegArgs = [
    ...inputArgs,
    "-filter_complex",
    xstackFilter,
    ...outputArgs,
  ];

  console.log(
    `Starting FFmpeg for cameras ${cameraIds.join(
      ", "
    )} with ${codecType} output`
  );
  console.log(`FFmpeg command: ffmpeg ${ffmpegArgs.join(" ")}`);

  // Add resource limits to the FFmpeg process
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    // Optimize memory usage by specifying resource limits
    env: {
      ...process.env,
      // Set custom environment variables if needed for memory limits
    },
  });

  // Set up data handlers with buffer size control
  let dataBufferSize = 0;
  const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB buffer limit

  // Handle FFmpeg output with flow control
  const onData = (data) => {
    if (wsClient.readyState === WebSocket.OPEN) {
      // Check if client is able to receive more data
      if (wsClient.bufferedAmount > MAX_BUFFER_SIZE) {
        // Skip frames if client is getting backlogged
        return;
      }

      wsClient.send(data, { binary: true }, (err) => {
        if (err) {
          console.error(
            `WebSocket send error for cameras ${cameraIds.join(", ")}:`,
            err
          );
          cleanup();
        }
      });
    }
  };

  ffmpeg.stdout.on("data", onData);

  // Log FFmpeg output for debugging and RTSP error detection
  ffmpeg.stderr.on("data", (data) => {
    const str = data.toString();

    // Look for memory-related errors specifically
    if (/cannot allocate memory/i.test(str) || /malloc.*failed/i.test(str)) {
      console.error(
        `Memory allocation error for cameras ${cameraIds.join(", ")}:`,
        str.trim()
      );

      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(
          JSON.stringify({
            type: "error",
            source: "memory",
            message: "Memory allocation error",
            detail:
              "FFmpeg cannot allocate required memory. Try selecting fewer cameras or lowering resolution.",
          })
        );
        wsClient.close(1011, "Memory allocation error");
      }
      cleanup();
      return;
    }

    // Detect RTSP-specific errors
    if (
      /connection (refused|timed out)/i.test(str) ||
      /404 not found/i.test(str) ||
      /could not find codec parameters/i.test(str) ||
      /invalid data found/i.test(str) ||
      /rtsp:.*error/i.test(str)
    ) {
      console.error(
        `RTSP error for cameras ${cameraIds.join(", ")}:`,
        str.trim()
      );
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(
          JSON.stringify({
            type: "error",
            source: "rtsp",
            message: "RTSP connection error",
            detail: str.trim(),
          })
        );
        wsClient.close(1011, "RTSP connection error");
      }
      cleanup();
      return;
    }

    if (str.toLowerCase().includes("error")) {
      console.log(`FFmpeg (Cameras ${cameraIds.join(", ")}):`, str.trim());
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(
          JSON.stringify({
            type: "error",
            source: "ffmpeg-stderr",
            message: "FFmpeg stderr error",
            detail: str.trim(),
          })
        );
      }
      if (str.toLowerCase().includes("fatal")) {
        cleanup();
        if (wsClient.readyState === WebSocket.OPEN) {
          wsClient.close(1011, "FFmpeg fatal error");
        }
      }
    } else if (str.toLowerCase().includes("warning")) {
      console.log(`FFmpeg (Cameras ${cameraIds.join(", ")}):`, str.trim());
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(
          JSON.stringify({
            type: "warning",
            source: "ffmpeg-stderr",
            message: "FFmpeg warning",
            detail: str.trim(),
          })
        );
      }
    }
  });

  // Improved cleanup to avoid double execution
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    ffmpeg.stdout.off("data", onData);
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
    activeTranscoders.delete(wsClient);
  };

  ffmpeg.on("close", (code, signal) => {
    console.log(
      `FFmpeg for cameras ${cameraIds.join(
        ", "
      )} closed with code ${code}, signal ${signal}`
    );
    cleanup();
  });

  ffmpeg.on("error", (err) => {
    console.error(`FFmpeg error for cameras ${cameraIds.join(", ")}:`, err);
    cleanup();
    // Notify client of FFmpeg error
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(
        JSON.stringify({
          type: "error",
          source: "ffmpeg",
          message: "FFmpeg process error",
          detail: err.message,
        })
      );
      wsClient.close(1011, "FFmpeg process error");
    }
  });

  // Handle unexpected FFmpeg exit
  ffmpeg.on("exit", (code, signal) => {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(
        JSON.stringify({
          type: "error",
          source: "ffmpeg-exit",
          message: `FFmpeg exited`,
          detail: `code ${code}, signal ${signal}`,
        })
      );
      wsClient.close(1011, "FFmpeg exited unexpectedly");
    }
  });

  // WebSocket client handlers remain the same
  wsClient.on("error", (err) => {
    console.error(`WebSocket error for cameras ${cameraIds.join(", ")}:`, err);
    cleanup();
    // Notify client of WebSocket error
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(
        JSON.stringify({
          type: "error",
          source: "websocket",
          message: "WebSocket error",
          detail: err.message,
        })
      );
      wsClient.close(1011, "WebSocket error");
    }
  });

  wsClient.on("unexpected-response", (req, res) => {
    console.error(
      `Unexpected WebSocket response for cameras ${cameraIds.join(", ")}`
    );
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(
        JSON.stringify({
          type: "error",
          source: "websocket",
          message: "Unexpected WebSocket response",
        })
      );
      wsClient.close(1011, "Unexpected WebSocket response");
    }
  });

  wsClient.on("close", (code, reason) => {
    cleanup();
    console.log(
      `WebSocket closed for cameras ${cameraIds.join(
        ", "
      )} (code: ${code}, reason: ${reason})`
    );
  });

  activeTranscoders.set(wsClient, ffmpeg);
  return ffmpeg;
}

// Add an alternative function to handle memory limitations by processing cameras in batches
function createSequentialTranscoder(cameraIds, wsClient, codecType = "mp4") {
  // Process only 2 cameras at a time to reduce memory usage
  const maxConcurrentCameras = 3;
  const cameraGroups = [];

  // Split cameras into groups of maxConcurrentCameras
  for (let i = 0; i < cameraIds.length; i += maxConcurrentCameras) {
    cameraGroups.push(cameraIds.slice(i, i + maxConcurrentCameras));
  }

  console.log(
    `Memory-saving mode: Processing cameras in ${cameraGroups.length} groups using ${codecType}`
  );

  // Start with the first group
  let currentGroupIndex = 0;
  let currentTranscoder = null;

  // Function to start the next group
  const startNextGroup = () => {
    if (currentGroupIndex >= cameraGroups.length) {
      currentGroupIndex = 0; // Loop back to first group
    }

    const currentGroup = cameraGroups[currentGroupIndex];
    console.log(
      `Starting group ${currentGroupIndex + 1}/${
        cameraGroups.length
      }: Cameras ${currentGroup.join(", ")}`
    );

    try {
      currentTranscoder = createTranscoder(currentGroup, wsClient, codecType);
    } catch (err) {
      console.error(
        `Error starting transcoder for group ${currentGroupIndex + 1}:`,
        err
      );

      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(
          JSON.stringify({
            type: "error",
            source: "sequential-transcoder",
            message: "Error starting camera group",
            detail: err.message,
          })
        );
      }
    }

    // Switch to next group after 15 seconds
    setTimeout(() => {
      if (currentTranscoder && !currentTranscoder.killed) {
        currentTranscoder.kill("SIGKILL");
      }
      currentGroupIndex++;
      startNextGroup();
    }, 15000);
  };

  // Start the first group
  startNextGroup();

  // Return a cleanup function
  return {
    kill: () => {
      if (currentTranscoder && !currentTranscoder.killed) {
        currentTranscoder.kill("SIGKILL");
      }
    },
  };
}

// HTTP server part remains unchanged
app.use(express.static("public"));
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({
  server,
  clientTracking: true,
  perMessageDeflate: false,
  maxPayload: 100 * 1024 * 1024, // 100MB
});

wss.on("connection", (ws, req) => {
  const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
  // Expect cameraIds as comma-separated: ?cameraIds=1,2,3,4,5,6
  const cameraIdsParam = params.get("cameraIds") || "1,2,3,4,5,6";
  const cameraIds = cameraIdsParam.split(",").slice(0, 6);

  // Get memory optimization flag
  const useMemoryOptimization = params.get("memoryOptimized") === "true";

  // Get codec type preference (default to mp4)
  const codecType = params.get("codecType") || "mp4";

  console.log(
    `New WebSocket connection for cameras ${cameraIds.join(
      ", "
    )} using ${codecType} format`
  );
  if (useMemoryOptimization) {
    console.log("Using memory-optimized mode");
  }

  let transcoder = null;
  let isAlive = true;
  let heartbeatInterval;
  let isInitialized = false;
  let memoryErrorDetected = false;

  // Track connection state
  let connectionClosed = false;

  // Start the transcoder after initialization
  const startTranscoder = () => {
    if (connectionClosed || ws.readyState !== WebSocket.OPEN) return;

    try {
      if (useMemoryOptimization || memoryErrorDetected) {
        transcoder = createSequentialTranscoder(cameraIds, ws, codecType);
      } else {
        transcoder = createTranscoder(cameraIds, ws, codecType);
      }
      console.log(
        `Transcoder started for cameras ${cameraIds.join(
          ", "
        )} using ${codecType}`
      );
    } catch (err) {
      console.error(
        `Error starting transcoder for cameras ${cameraIds.join(", ")}:`,
        err
      );
      cleanup();
    }
  };

  // Heartbeat check
  const heartbeat = () => {
    isAlive = true;
  };

  ws.on("pong", heartbeat);

  // Handle messages from client
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === "request_init" && !isInitialized) {
        // Update codec type if specified in the message
        if (msg.codecType) {
          codecType = msg.codecType;
          console.log(`Client requested ${codecType} format`);
        }
        startTranscoder();
        isInitialized = true;
      } else if (msg.type === "switch_to_memory_optimized" && isInitialized) {
        // Client can request to switch to memory-optimized mode
        memoryErrorDetected = true;

        // Kill current transcoder
        if (transcoder) {
          if (typeof transcoder.kill === "function") {
            transcoder.kill();
          } else {
            transcoder.kill("SIGKILL");
          }
        }

        // Restart in memory-optimized mode
        transcoder = createSequentialTranscoder(cameraIds, ws);
        console.log(
          `Switched to memory-optimized mode for cameras ${cameraIds.join(
            ", "
          )}`
        );
      }
    } catch (e) {
      console.log("Received non-JSON message:", message.toString());
    }
  });

  // Cleanup function
  const cleanup = () => {
    if (connectionClosed) return;
    connectionClosed = true;

    clearInterval(heartbeatInterval);
    if (transcoder) {
      if (typeof transcoder.kill === "function") {
        transcoder.kill();
      } else {
        transcoder.kill("SIGKILL");
      }
    }
    activeTranscoders.delete(ws);
  };

  ws.on("close", () => {
    cleanup();
    console.log(`Client disconnected for cameras ${cameraIds.join(", ")}`);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for cameras ${cameraIds.join(", ")}:`, err);
    cleanup();
  });

  // Heartbeat interval
  heartbeatInterval = setInterval(() => {
    if (connectionClosed) {
      clearInterval(heartbeatInterval);
      return;
    }

    if (!isAlive) {
      console.log(
        `Terminating connection for cameras ${cameraIds.join(
          ", "
        )} (no heartbeat)`
      );
      cleanup();
      ws.close(4000, "No heartbeat received");
      return;
    }
    isAlive = false;

    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 60000); // 60 seconds

  // Start initialization process with small delay
  setTimeout(() => {
    if (!connectionClosed && ws.readyState === WebSocket.OPEN) {
      startTranscoder();
      isInitialized = true;
    }
  }, 100);
});

// Error handling
wss.on("error", (err) => {
  console.error("WebSocket server error:", err);
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down server gracefully...");

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, "Server shutdown");
    }
  });

  // Kill all active transcoders
  activeTranscoders.forEach((transcoder) => {
    if (typeof transcoder.kill === "function") {
      transcoder.kill();
    } else if (!transcoder.killed) {
      transcoder.kill("SIGKILL");
    }
  });

  // Close servers
  setTimeout(() => {
    wss.close(() => {
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });
  }, 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
