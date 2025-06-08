const onvif = require("node-onvif");
const express = require("express");
const app = express();
const WebSocket = require("ws");

// Discover ONVIF cameras
async function discoverCameras() {
  const devices = await onvif.startProbe();
  const cameras = [];

  for (const device of devices) {
    const cam = new onvif.OnvifDevice({
      xaddr: device.xaddrs[0],
      user: "admin",
      pass: "pass1111",
    });

    await cam.init();
    const profiles = await cam.getProfiles();
    const rtspUrl = profiles[0].stream.rtsp.url; // Get RTSP URL
    cameras.push({ name: device.name, rtspUrl });
  }

  return cameras;
}

discoverCameras()
  .then((cameras) => {
    console.log("Discovered cameras:", cameras);
    // Start the Express server
    app.get("/cameras", (req, res) => {
      res.json(cameras);
    });

    const PORT = 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error discovering cameras:", err);
  });
