interface Config {
  camera: {
    username: string;
    password: string;
    host: string;
    port: number;
    path: string;
    maxCameras: number;
    totalCameras: number;
  };
  websocket: {
    host: string;
    port: number;
    url: string;
  };
  detection: {
    interval: number;
    threshold: number;
    maxChunkErrors: number;
    bufferCleanupInterval: number;
  };
  video: {
    bitrate: string;
    framerate: number;
    gridWidth: number;
    gridHeight: number;
  };
  debug: boolean;
}

const config: Config = {
  camera: {
    username: import.meta.env.VITE_CAMERA_USERNAME || "admin",
    password: import.meta.env.VITE_CAMERA_PASSWORD || "password",
    host: import.meta.env.VITE_CAMERA_HOST || "192.168.1.100",
    port: parseInt(import.meta.env.VITE_CAMERA_PORT) || 554,
    path: import.meta.env.VITE_CAMERA_PATH || "/cam/realmonitor",
    maxCameras: parseInt(import.meta.env.VITE_MAX_CAMERAS) || 6,
    totalCameras: parseInt(import.meta.env.VITE_TOTAL_CAMERAS) || 16,
  },
  websocket: {
    host: import.meta.env.VITE_WEBSOCKET_HOST || "localhost",
    port: parseInt(import.meta.env.VITE_WEBSOCKET_PORT) || 3001,
    get url() {
      return `ws://${this.host}:${this.port}`;
    },
  },
  detection: {
    interval: parseInt(import.meta.env.VITE_DETECTION_INTERVAL) || 500,
    threshold: parseFloat(import.meta.env.VITE_DETECTION_THRESHOLD) || 0.3,
    maxChunkErrors: parseInt(import.meta.env.VITE_MAX_CHUNK_ERRORS) || 50,
    bufferCleanupInterval:
      parseInt(import.meta.env.VITE_BUFFER_CLEANUP_INTERVAL) || 30000,
  },
  video: {
    bitrate: import.meta.env.VITE_VIDEO_BITRATE || "1M",
    framerate: parseInt(import.meta.env.VITE_VIDEO_FRAMERATE) || 15,
    gridWidth: parseInt(import.meta.env.VITE_CAMERA_GRID_WIDTH) || 480,
    gridHeight: parseInt(import.meta.env.VITE_CAMERA_GRID_HEIGHT) || 270,
  },
  debug: import.meta.env.VITE_DEBUG_MODE === "true",
};

export default config;

// Helper function to build RTSP URL
export const buildRTSPUrl = (cameraId: number): string => {
  const { username, password, host, port, path } = config.camera;
  return `rtsp://${username}:${password}@${host}:${port}${path}?channel=${cameraId}&subtype=0`;
};

// Helper function to build WebSocket URL
export const buildWebSocketUrl = (
  cameraIds: number[],
  codecType: string = "mp4"
): string => {
  const cameraIdsParam = cameraIds.join(",");
  return `${config.websocket.url}/?cameraIds=${cameraIdsParam}&codecType=${codecType}`;
};
