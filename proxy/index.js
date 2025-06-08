require("dotenv").config();
const express = require("express");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const cors = require("cors");

const app = express();
app.use(cors());

// Configuration from environment variables
const config = {
  camera: {
    username: process.env.CAMERA_USERNAME || "admin",
    password: process.env.CAMERA_PASSWORD || "password",
    host: process.env.CAMERA_HOST || "192.168.1.100",
    port: parseInt(process.env.CAMERA_PORT) || 554,
    path: process.env.CAMERA_PATH || "/cam/realmonitor",
  },
  server: {
    port: parseInt(process.env.PORT) || 3001,
    websocketPort: parseInt(process.env.WEBSOCKET_PORT) || 3001,
  },
  video: {
    bitrate: process.env.VIDEO_BITRATE || "1M",
    framerate: parseInt(process.env.VIDEO_FRAMERATE) || 15,
    gridWidth: parseInt(process.env.CAMERA_GRID_WIDTH) || 480,
    gridHeight: parseInt(process.env.CAMERA_GRID_HEIGHT) || 270,
  },
  ffmpeg: {
    timeout: parseInt(process.env.FFMPEG_TIMEOUT) || 10000000,
    reconnectDelayMax: parseInt(process.env.RECONNECT_DELAY_MAX) || 5,
    maxRestartAttempts: parseInt(process.env.MAX_RESTART_ATTEMPTS) || 5,
  },
  debug: process.env.DEBUG === "true",
};

// Helper function to build RTSP URL
const buildRTSPUrl = (cameraId) => {
  const { username, password, host, port, path } = config.camera;
  return `rtsp://${username}:${password}@${host}:${port}${path}?channel=${cameraId}&subtype=0`;
};

// WebSocket server
const wss = new WebSocket.Server({ port: config.server.websocketPort });

function createTranscoder(cameraIds, wsClient, codecType = "mp4") {
  const rtspUrls = cameraIds.map(buildRTSPUrl);

  const inputArgs = rtspUrls.flatMap((url, index) => [
    "-rtsp_transport",
    "tcp",
    "-reconnect",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    config.ffmpeg.reconnectDelayMax.toString(),
    "-timeout",
    config.ffmpeg.timeout.toString(),
    "-i",
    url,
  ]);

  const scaleFilters = cameraIds
    .map(
      (_, i) =>
        `[${i}:v]scale=${config.video.gridWidth}:${config.video.gridHeight}[v${i}]`
    )
    .join(";");

  const scaledInputs = cameraIds.map((_, i) => `[v${i}]`).join("");
  const xstackFilter = `${scaleFilters};${scaledInputs}xstack=inputs=${cameraIds.length}:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[v]`;

  let outputArgs = [];
  if (codecType === "webm") {
    outputArgs = [
      "-map",
      "[v]",
      "-c:v",
      "libvpx",
      "-b:v",
      config.video.bitrate,
      "-crf",
      "25",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-auto-alt-ref",
      "0",
      "-lag-in-frames",
      "0",
      "-bufsize",
      "600k",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-f",
      "webm",
      "-cluster_size_limit",
      "2M",
      "-cluster_time_limit",
      "5000",
      "-dash",
      "1",
      "pipe:1",
    ];
  } else {
    outputArgs = [
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-b:v",
      config.video.bitrate,
      "-maxrate",
      config.video.bitrate,
      "-bufsize",
      "2M",
      "-g",
      "15",
      "-keyint_min",
      "15",
      "-sc_threshold",
      "0",
      "-r",
      config.video.framerate.toString(),
      "-an",
      "-pix_fmt",
      "yuv420p",
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

  if (config.debug) {
    console.log("FFmpeg command:", ffmpegArgs.join(" "));
  }

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  ffmpeg.stdout.on("data", (data) => {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(data, { binary: true });
    }
  });

  ffmpeg.stderr.on("data", (data) => {
    if (config.debug) {
      console.log(`FFmpeg stderr: ${data}`);
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg process closed with code ${code}`);
  });

  return ffmpeg;
}

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection");

  const url = new URL(req.url, `http://${req.headers.host}`);
  const cameraIdsParam = url.searchParams.get("cameraIds");
  const codecType = url.searchParams.get("codecType") || "mp4";

  if (!cameraIdsParam) {
    ws.close(1008, "Camera IDs required");
    return;
  }

  const cameraIds = cameraIdsParam.split(",").map(Number);

  if (cameraIds.length !== config.camera.maxCameras) {
    ws.close(1008, "Exactly 6 camera IDs required");
    return;
  }

  let ffmpeg = null;
  let isInitialized = false;

  const startTranscoder = () => {
    if (ffmpeg) {
      ffmpeg.kill();
    }
    ffmpeg = createTranscoder(cameraIds, ws, codecType);
  };

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === "request_init" && !isInitialized) {
        startTranscoder();
        isInitialized = true;
      }
    } catch (e) {
      console.log("Received non-JSON message");
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    if (ffmpeg) {
      ffmpeg.kill();
    }
  });
});

console.log(`WebSocket server running on port ${config.server.websocketPort}`);
