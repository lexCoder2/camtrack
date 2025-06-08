import "./App.css";
import CameraSelector from "./components/CameraSelector";
import VideoStream from "./components/VideoStream";
import PersonTracker from "./components/PersonTracker";
import { useCameraSelection } from "./hooks/useCameraSelection";
import { useVideoStream } from "./hooks/useVideoStream";
import { usePersonTracking } from "./hooks/usePersonTracking";

function App() {
  // Initialize all hooks with proper error handling
  const {
    selectedCameras = [],
    isSelectionComplete = false,
    handleCameraToggle,
    resetSelection,
  } = useCameraSelection() || {};

  const {
    streamUrl = "",
    connectionStatus = "disconnected",
    videoRef,
  } = useVideoStream(selectedCameras, isSelectionComplete) || {};

  const {
    trackedPersons = [],
    detectionSequence = [],
    isModelLoaded = false,
    isDetecting = false,
    loadingStatus = "Loading...",
    detectionResults = [], // Add detection results for visualization
    lastDetectionTime = null,
  } = usePersonTracking(videoRef, connectionStatus === "connected") || {};

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>Camera Selection</h2>
        <CameraSelector
          selectedCameras={selectedCameras}
          isSelectionComplete={isSelectionComplete}
          onCameraToggle={handleCameraToggle}
          onReset={resetSelection}
        />

        {/* Add detection status */}
        <div className="detection-status">
          <h3>Detection Status</h3>
          <div>Model: {isModelLoaded ? "✅ Loaded" : "⏳ Loading..."}</div>
          <div>Status: {isDetecting ? "🔍 Detecting" : "⏸️ Idle"}</div>
          <div>Stream: {connectionStatus}</div>
          <div>
            Last Detection:{" "}
            {lastDetectionTime
              ? new Date(lastDetectionTime).toLocaleTimeString()
              : "None"}
          </div>
          <div>People Found: {trackedPersons.length}</div>
        </div>
      </div>

      <div className="main-content">
        <div className="video-container">
          <h2>Camera Grid View</h2>
          <VideoStream
            videoRef={videoRef}
            streamUrl={streamUrl}
            connectionStatus={connectionStatus}
            detectionResults={detectionResults} // Pass detection results for overlay
            isDetecting={isDetecting}
          />
        </div>
        <div className="tracking-results">
          <h2>Person Tracking</h2>
          <PersonTracker
            trackedPersons={trackedPersons}
            detectionSequence={detectionSequence}
            isModelLoaded={isModelLoaded}
            isDetecting={isDetecting}
            loadingStatus={loadingStatus}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
