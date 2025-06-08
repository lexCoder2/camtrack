# CamTracker2 - Real-time Security Camera Person Detection System

A React-based security camera monitoring system that provides real-time person detection and tracking across multiple RTSP camera feeds using AI/ML models.

## Features

- **Multi-Camera Support**: Monitor up to 6 security cameras simultaneously in a 2x3 grid layout
- **Real-time Person Detection**: Uses TensorFlow.js and COCO-SSD model for accurate person detection
- **Person Tracking**: Tracks individuals across camera feeds with unique IDs
- **Live Streaming**: Real-time RTSP stream processing with WebSocket connections
- **Resilient Connection**: Automatic reconnection and error recovery for stable streaming
- **Interactive UI**: Modern React interface with camera selection and detection status

## Tech Stack

### Frontend

- **React 19** with TypeScript
- **TensorFlow.js** for AI-powered person detection
- **COCO-SSD model** for object detection
- **WebSocket** for real-time video streaming
- **Vite** for fast development and building

### Backend (Proxy Server)

- **Node.js** with Express
- **WebSocket Server** for streaming
- **FFmpeg** for RTSP stream processing and video transcoding
- **Multi-format support** (MP4/WebM)

## Prerequisites

- Node.js (v16 or higher)
- FFmpeg installed and accessible in PATH
- RTSP security cameras (configured for H.264 streaming)
- Modern web browser with WebGL support

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd camtracker2
   ```

2. **Install frontend dependencies**

   ```bash
   npm install
   ```

3. **Install proxy server dependencies**

   ```bash
   cd proxy
   npm install
   cd ..
   ```

4. **Configure camera settings**

   Edit `proxy/index.js` and update the RTSP URLs:

   ```js
   const rtspUrls = cameraIds.map(
     (id) =>
       `rtsp://admin:pass1111@192.168.6.160:554/cam/realmonitor?channel=${id}&subtype=0`
   );
   ```

## Usage

### Starting the Application

1. **Start the proxy server** (in one terminal):

   ```bash
   cd proxy
   npm start
   ```

2. **Start the React application** (in another terminal):

   ```bash
   npm run dev
   ```

3. **Access the application**

   Open your browser and navigate to `http://localhost:5173`

### Using the Interface

1. **Select Cameras**: Choose exactly 6 cameras from the 16 available options
2. **View Live Feed**: Once cameras are selected, the 2x3 grid video feed will start
3. **Monitor Detection**: Watch real-time person detection with bounding boxes
4. **Track People**: View tracked individuals in the sidebar with confidence scores and timestamps

## Configuration

### Camera Settings

Modify camera configuration in `proxy/index.js`:

```js
// Update RTSP URL pattern
const rtspUrls = cameraIds.map(
  (id) => `rtsp://username:password@camera-ip:port/stream-path?channel=${id}`
);
```

### Detection Settings

Adjust detection parameters in `src/hooks/usePersonTracking.ts`:

```ts
// Detection interval (milliseconds)
detectionIntervalRef.current = setInterval(() => {
  runDetection();
}, 1000); // 1 second intervals

// Confidence threshold
const personDetections = predictions.filter(
  (prediction) => prediction.class === "person" && prediction.score > 0.5
);
```

### Stream Quality

Modify video quality in `proxy/index.js`:

```js
// For MP4 output
"-b:v",
  "1M", // Bitrate
  "-r",
  "15", // Frame rate
  "scale=480:270"; // Resolution per camera
```

## Project Structure

```
camtracker2/
├── src/
│   ├── components/
│   │   ├── CameraSelector.tsx    # Camera selection interface
│   │   ├── VideoStream.tsx       # Video display with detection overlay
│   │   └── PersonTracker.tsx     # Person tracking results
│   ├── hooks/
│   │   ├── useCameraSelection.ts # Camera selection logic
│   │   ├── useVideoStream.ts     # WebSocket video streaming
│   │   └── usePersonTracking.ts  # AI person detection
│   ├── App.tsx                   # Main application component
│   └── App.css                   # Styling
├── proxy/
│   ├── index.js                  # WebSocket server & FFmpeg processing
│   ├── discovercameras.js        # ONVIF camera discovery
│   └── package.json
├── package.json
└── README.md
```

## API Endpoints

### WebSocket Connection

- **URL**: `ws://localhost:3001/?cameraIds=1,2,3,4,5,6&codecType=mp4`
- **Purpose**: Real-time video streaming
- **Format**: Binary video data

### Messages

```js
// Client to Server
{ type: "request_init", codecType: "mp4" }
{ type: "ping", timestamp: Date.now() }

// Server to Client
{ type: "error", source: "rtsp", message: "Connection error" }
{ type: "pong", timestamp: Date.now() }
```

## Performance Optimization

### Memory Management

- Automatic buffer cleanup
- Frame dropping during high load
- Configurable chunk error limits

### Detection Optimization

- WebGL acceleration when available
- CPU fallback for compatibility
- Optimized detection intervals

### Network Resilience

- Automatic WebSocket reconnection
- RTSP stream recovery
- Exponential backoff retry logic

## Troubleshooting

### Common Issues

**Video not loading:**

- Check RTSP camera URLs and credentials
- Verify FFmpeg installation
- Ensure cameras support H.264 encoding

**Detection not working:**

- Check browser WebGL support
- Verify TensorFlow.js model loading
- Ensure video element has valid frames

**High CPU usage:**

- Reduce detection frequency
- Lower video resolution/bitrate
- Use hardware acceleration if available

**Connection drops:**

- Check network stability
- Verify camera stream availability
- Monitor proxy server logs

### Debug Mode

Enable debug logging:

```js
// In proxy/index.js
console.log("FFmpeg command:", ffmpegArgs.join(" "));

// In browser console
localStorage.setItem("debug", "true");
```

## Development

### Building for Production

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and support:

- Check the troubleshooting section
- Review console logs for errors
- Ensure all prerequisites are met
- Verify camera compatibility
