import { useState, useEffect, useCallback } from "react";

const MAX_CAMERAS = 6;
const TOTAL_CAMERAS = 16;
const STORAGE_KEY = "selectedCameras";

export function useCameraSelection() {
  const [selectedCameras, setSelectedCameras] = useState<number[]>(() => {
    try {
      const savedSelection = localStorage.getItem(STORAGE_KEY);
      // Ensure we're parsing a valid array and return empty array as fallback
      const parsedSelection = savedSelection ? JSON.parse(savedSelection) : [];
      return Array.isArray(parsedSelection) ? parsedSelection : [];
    } catch (error) {
      console.error("Error parsing selectedCameras from localStorage:", error);
      return [];
    }
  });

  const [isSelectionComplete, setIsSelectionComplete] = useState(
    selectedCameras.length === MAX_CAMERAS
  );

  // Save to localStorage whenever selection changes
  useEffect(() => {
    if (selectedCameras.length === MAX_CAMERAS) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedCameras));
      setIsSelectionComplete(true);
    } else {
      setIsSelectionComplete(false);
    }
  }, [selectedCameras]);

  const handleCameraToggle = useCallback((cameraId: number) => {
    setSelectedCameras((prev) => {
      if (prev.includes(cameraId)) {
        // Remove camera if already selected
        return prev.filter((id) => id !== cameraId);
      } else if (prev.length < MAX_CAMERAS) {
        // Add camera if under max limit
        return [...prev, cameraId];
      }
      return prev;
    });
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedCameras([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    selectedCameras,
    isSelectionComplete,
    handleCameraToggle,
    resetSelection,
  };
}