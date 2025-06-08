import { useState, useEffect, useRef, RefObject, useCallback, useMemo } from "react";
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

type TrackedPerson = {
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
};

type DetectionSequence = {
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
};

type Detection = {
  bbox: [number, number, number, number]; // [x, y, width, height]
  score: number;
  class: string;
};

export function usePersonTracking(videoRef: RefObject<HTMLVideoElement>) {
  const [trackedPersons, setTrackedPersons] = useState<TrackedPerson[]>([]);
  const [detectionSequence, setDetectionSequence] = useState<DetectionSequence[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const personIdCounterRef = useRef(0);
  const isLoadingRef = useRef(false);
  const isDetectingRef = useRef(false); // Use ref instead of state for internal logic
  
  // Initialize TensorFlow.js and load the COCO-SSD model
  useEffect(() => {
    if (isLoadingRef.current) return;
    
    const loadModel = async () => {
      if (isLoadingRef.current || isModelLoaded) return;
      isLoadingRef.current = true;
      
      try {
        setLoadingStatus("Setting up TensorFlow.js...");
        console.log("Loading TensorFlow.js...");
        
        await tf.ready();
        
        try {
          await tf.setBackend('webgl');
          console.log("Using WebGL backend");
        } catch (e) {
          console.warn("WebGL not available, falling back to CPU");
          await tf.setBackend('cpu');
        }
        
        console.log("TensorFlow.js backend:", tf.getBackend());
        
        setLoadingStatus("Loading COCO-SSD model...");
        console.log("Loading COCO-SSD model...");
        
        const model = await cocoSsd.load({
          base: 'lite_mobilenet_v2'
        });
        
        modelRef.current = model;
        setIsModelLoaded(true);
        setLoadingStatus("Model loaded successfully!");
        console.log("COCO-SSD model loaded successfully");
        
      } catch (error) {
        console.error("Error loading model:", error);
        setLoadingStatus("Model loading failed. Retrying...");
        
        setTimeout(() => {
          isLoadingRef.current = false;
          setLoadingStatus("Retrying model load...");
        }, 3000);
      }
    };
    
    loadModel();
    
    return () => {
      if (modelRef.current && typeof modelRef.current.dispose === 'function') {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
  }, []); // Empty dependency array
  
  // Detection function - no dependencies
  const runDetection = useCallback(async () => {
    const videoElement = videoRef.current;
    if (!videoElement || !modelRef.current) return;
    
    // Better checks for video readiness
    if (videoElement.readyState < 2 || 
        videoElement.paused || 
        videoElement.videoWidth === 0 || 
        videoElement.videoHeight === 0) {
      return;
    }
    
    try {
      // Run detection directly on the video element
      const predictions = await modelRef.current.detect(videoElement);
      
      // Filter for person detections
      const personDetections = predictions
        .filter(prediction => prediction.class === 'person' && prediction.score > 0.5)
        .map(prediction => ({
          bbox: prediction.bbox,
          score: prediction.score,
          class: prediction.class
        }));
      
      // Update tracked persons
      setTrackedPersons(currentPersons => {
        const currentTime = new Date();
        const updatedPersons: TrackedPerson[] = [];
        const usedPersonIds = new Set<string>();
        
        // Match detections to existing persons
        personDetections.forEach((detection) => {
          let matchedPerson = currentPersons.find(person => {
            if (usedPersonIds.has(person.id)) return false;
            
            const timeDiff = currentTime.getTime() - person.lastSeen.getTime();
            if (timeDiff > 10000) return false;
            
            const [x1, y1, w1, h1] = detection.bbox;
            const { x: x2, y: y2, width: w2, height: h2 } = person.boundingBox;
            
            const center1 = { x: x1 + w1/2, y: y1 + h1/2 };
            const center2 = { x: x2 + w2/2, y: y2 + h2/2 };
            
            const distance = Math.sqrt(
              Math.pow(center1.x - center2.x, 2) + 
              Math.pow(center1.y - center2.y, 2)
            );
            
            return distance < 150;
          });
          
          if (matchedPerson) {
            usedPersonIds.add(matchedPerson.id);
            updatedPersons.push({
              ...matchedPerson,
              lastSeen: currentTime,
              confidence: detection.score,
              boundingBox: {
                x: detection.bbox[0],
                y: detection.bbox[1],
                width: detection.bbox[2],
                height: detection.bbox[3]
              }
            });
          } else {
            // Create new person
            const newPersonId = `person_${++personIdCounterRef.current}`;
            const newPerson = {
              id: newPersonId,
              detectedIn: [1],
              lastSeen: currentTime,
              confidence: detection.score,
              boundingBox: {
                x: detection.bbox[0],
                y: detection.bbox[1],
                width: detection.bbox[2],
                height: detection.bbox[3]
              }
            };
            
            updatedPersons.push(newPerson);
            
            // Add to detection sequence
            setDetectionSequence(prev => [...prev, {
              personId: newPersonId,
              sequence: [{
                cameraId: 1,
                timestamp: currentTime,
                confidence: detection.score,
                boundingBox: {
                  x: detection.bbox[0],
                  y: detection.bbox[1],
                  width: detection.bbox[2],
                  height: detection.bbox[3]
                }
              }]
            }]);
          }
        });
        
        // Keep recent persons
        const recentPersons = currentPersons.filter(person => {
          const timeDiff = currentTime.getTime() - person.lastSeen.getTime();
          return timeDiff < 30000 && !usedPersonIds.has(person.id);
        });
        
        const result = [...updatedPersons, ...recentPersons];
        
        if (personDetections.length > 0) {
          console.log(`Detected ${personDetections.length} person(s)`);
        }
        
        return result;
      });
      
    } catch (error) {
      console.error("Detection error:", error);
    }
  }, []); // No dependencies at all
  
  // Video event handlers
  useEffect(() => {
    const videoElement = videoRef.current;
    
    if (!videoElement || !isModelLoaded) {
      return;
    }
    
    const startDetection = () => {
      if (videoElement.readyState >= 2 && !videoElement.paused && !isDetectingRef.current) {
        console.log("Starting person detection...");
        isDetectingRef.current = true;
        setIsDetecting(true);
        
        // Clear any existing interval
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
        
        detectionIntervalRef.current = setInterval(() => {
          runDetection();
        }, 1000); // Changed from 3000ms to 1000ms
      }
    };
    
    const stopDetection = () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
        isDetectingRef.current = false;
        setIsDetecting(false);
        console.log("Stopped person detection");
      }
    };
    
    // Event handlers
    const handlePlaying = () => startDetection();
    const handlePause = () => stopDetection();
    const handleEnded = () => stopDetection();
    const handleError = () => stopDetection();
    
    videoElement.addEventListener('playing', handlePlaying);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('error', handleError);
    
    // Start detection if video is already playing
    if (videoElement.readyState >= 2 && !videoElement.paused) {
      startDetection();
    }
    
    return () => {
      videoElement.removeEventListener('playing', handlePlaying);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('ended', handleEnded);
      videoElement.removeEventListener('error', handleError);
      stopDetection();
    };
  }, [isModelLoaded]); // Only depend on isModelLoaded
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, []);
  
  return {
    trackedPersons,
    detectionSequence,
    isModelLoaded,
    isDetecting,
    loadingStatus
  };
}