import React from "react";

interface TrackedPerson {
  id: string;
  detectedIn: number[];
  lastSeen: Date;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface DetectionSequence {
  personId: string;
  sequence: { 
    cameraId: number; 
    timestamp: Date;
    confidence: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
}

interface PersonTrackerProps {
  trackedPersons: TrackedPerson[];
  detectionSequence: DetectionSequence[];
  isModelLoaded?: boolean;
  isDetecting?: boolean;
  loadingStatus?: string;
}

const PersonTracker: React.FC<PersonTrackerProps> = ({
  trackedPersons,
  detectionSequence,
  isModelLoaded = false,
  isDetecting = false,
  loadingStatus = "Loading..."
}) => {
  return (
    <div className="person-tracker">
      {/* Status indicators */}
      <div className="tracker-status">
        <div className="status-item">
          <span className={`status-dot ${isModelLoaded ? 'connected' : 'connecting'}`}></span>
          <span>Model: {isModelLoaded ? 'Ready' : 'Loading'}</span>
        </div>
        <div className="status-item">
          <span className={`status-dot ${isDetecting ? 'connected' : 'disconnected'}`}></span>
          <span>Detection: {isDetecting ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
      
      <div className="tracker-stats">
        <div className="stat-item">
          <span className="stat-value">{trackedPersons.length}</span>
          <span className="stat-label">People Tracked</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{detectionSequence.length}</span>
          <span className="stat-label">Detection Events</span>
        </div>
      </div>

      {!isModelLoaded && (
        <div className="loading-message">
          <div className="spinner"></div>
          <p>{loadingStatus}</p>
        </div>
      )}

      {isModelLoaded && trackedPersons.length > 0 ? (
        <div className="tracked-persons-list">
          {trackedPersons.map((person) => (
            <div key={person.id} className="person-card">
              <div className="person-header">
                <h4>ID: {person.id.substring(7)}</h4>
                <span className="last-seen">
                  Last seen: {person.lastSeen.toLocaleTimeString()}
                </span>
              </div>

              <div className="detection-info">
                <div className="confidence-info">
                  <span className="confidence-label">Confidence:</span>
                  <span className="confidence-value">
                    {(person.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                
                <div className="bounding-box-info">
                  <h5>Location:</h5>
                  <div className="bbox-details">
                    <span>X: {Math.round(person.boundingBox.x)}</span>
                    <span>Y: {Math.round(person.boundingBox.y)}</span>
                    <span>W: {Math.round(person.boundingBox.width)}</span>
                    <span>H: {Math.round(person.boundingBox.height)}</span>
                  </div>
                </div>
                
                <div className="camera-presence">
                  <h5>Detected in cameras:</h5>
                  <div className="camera-badges">
                    {person.detectedIn.map((cameraId) => (
                      <span key={cameraId} className="camera-badge">
                        {cameraId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-detections">
          {!isModelLoaded ? (
            <p>Loading AI model for person detection...</p>
          ) : (
            <p>{isDetecting ? "Scanning for people..." : "Start video to begin detection"}</p>
          )}
        </div>
      )}
      
      {/* Detection sequence history */}
      {detectionSequence.length > 0 && (
        <div className="detection-history">
          <h3>Recent Detection Events</h3>
          <div className="sequence-list">
            {detectionSequence.slice(-5).reverse().map((sequence, index) => (
              <div key={index} className="sequence-item">
                <strong>Person {sequence.personId.substring(7)}</strong>
                <div className="sequence-events">
                  {sequence.sequence.slice(-3).map((event, eventIndex) => (
                    <div key={eventIndex} className="event-item">
                      Camera {event.cameraId} at {event.timestamp.toLocaleTimeString()} 
                      ({(event.confidence * 100).toFixed(1)}%)
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonTracker;
