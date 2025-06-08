import { useState, useEffect } from "react";
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
    streamUrl = "ws://localhost:3001",
    connectionStatus = "disconnected",
    videoRef,
  } = useVideoStream(selectedCameras, isSelectionComplete) || {};

  const { trackedPersons = [], detectionSequence = [] } =
    usePersonTracking(videoRef) || {};

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
      </div>
      <div className="main-content">
        <div className="video-container">
          <h2>Camera Grid View</h2>
          <VideoStream
            videoRef={videoRef}
            streamUrl={streamUrl}
            connectionStatus={connectionStatus}
          />
        </div>
        <div className="tracking-results">
          <h2>Person Tracking</h2>
          <PersonTracker
            trackedPersons={trackedPersons}
            detectionSequence={detectionSequence}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
