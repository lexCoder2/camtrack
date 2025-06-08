import React from "react";

interface CameraSelectorProps {
  selectedCameras: number[];
  isSelectionComplete: boolean;
  onCameraToggle: (cameraId: number) => void;
  onReset: () => void;
}

const CameraSelector: React.FC<CameraSelectorProps> = ({
  selectedCameras,
  isSelectionComplete,
  onCameraToggle,
  onReset,
}) => {
  // Make sure selectedCameras is always an array
  const safeSelectedCameras = Array.isArray(selectedCameras) ? selectedCameras : [];

  // Generate array of available camera IDs (1-16)
  const availableCameras = Array.from({ length: 16 }, (_, i) => i + 1);

  return (
    <div className="camera-selector">
      <div className="selection-status">
        {isSelectionComplete ? (
          <span className="status complete">
            Selection complete (6 cameras)
          </span>
        ) : (
          <span className="status incomplete">
            Select {6 - safeSelectedCameras.length} more camera
            {safeSelectedCameras.length === 5 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="camera-grid">
        {availableCameras.map((cameraId) => (
          <button
            key={cameraId}
            className={`camera-button ${
              safeSelectedCameras.includes(cameraId) ? "selected" : ""
            }`}
            onClick={() => onCameraToggle(cameraId)}
            disabled={
              isSelectionComplete && !safeSelectedCameras.includes(cameraId)
            }
          >
            {cameraId}
          </button>
        ))}
      </div>

      <button
        className="reset-button"
        onClick={onReset}
        disabled={safeSelectedCameras.length === 0}
      >
        Reset Selection
      </button>

      {isSelectionComplete && (
        <div className="selected-cameras">
          <h3>Selected Cameras</h3>
          <div className="camera-list">
            {safeSelectedCameras.map((id) => (
              <div key={id} className="camera-item">
                Camera {id}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraSelector;
