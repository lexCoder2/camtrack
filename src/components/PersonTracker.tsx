import React from "react";

interface TrackedPerson {
  id: string;
  detectedIn: number[];
  lastSeen: Date;
}

interface DetectionSequence {
  personId: string;
  sequence: { cameraId: number; timestamp: Date }[];
}

interface PersonTrackerProps {
  trackedPersons: TrackedPerson[];
  detectionSequence: DetectionSequence[];
}

const PersonTracker: React.FC<PersonTrackerProps> = ({
  trackedPersons,
  detectionSequence,
}) => {
  return (
    <div className="person-tracker">
      <div className="tracker-stats">
        <div className="stat-item">
          <span className="stat-value">{trackedPersons.length}</span>
          <span className="stat-label">People Tracked</span>
        </div>
      </div>

      {trackedPersons.length > 0 ? (
        <div className="tracked-persons-list">
          {trackedPersons.map((person) => (
            <div key={person.id} className="person-card">
              <div className="person-header">
                <h4>ID: {person.id.substring(0, 8)}...</h4>
                <span className="last-seen">
                  Last seen: {person.lastSeen.toLocaleTimeString()}
                </span>
              </div>

              <div className="detection-info">
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
          <p>No people detected yet</p>
        </div>
      )}
    </div>
  );
};

export default PersonTracker;
