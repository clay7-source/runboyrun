import { ParsedActivityData, TcxSplit, DataPoint, BestEffort } from "../types";

/**
 * Deterministic parsing of TCX XML data.
 * Does NOT use AI. Uses standard DOM Parsing.
 */
export const parseTcxFileContent = (xmlContent: string): ParsedActivityData => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  const trackpoints = xmlDoc.querySelectorAll("Trackpoint");
  
  if (trackpoints.length === 0) {
    throw new Error("No trackpoints found in TCX file.");
  }

  let totalDistance = 0;
  let startTime = 0;
  let endTime = 0;
  let heartRateSum = 0;
  let heartRateCount = 0;
  let maxHr = 0;
  let elevationGain = 0;
  let lastAltitude = -9999;

  // Split calculation variables
  const splits: TcxSplit[] = [];
  let currentSplitStartTime = 0;
  let currentSplitHrSum = 0;
  let currentSplitHrCount = 0;
  let splitIndex = 1;

  // Sampling for charts (Target ~150 points)
  const sampleRate = Math.max(1, Math.floor(trackpoints.length / 150));
  const seriesSample: DataPoint[] = [];

  // Best Effort Calculation Variables
  // We store raw points to do a sliding window check for best efforts
  const rawPoints: { time: number; dist: number }[] = [];

  // Iterate points
  trackpoints.forEach((point, index) => {
    // 1. Time
    const timeNode = point.querySelector("Time");
    const timestamp = timeNode ? new Date(timeNode.textContent || "").getTime() : 0;

    if (index === 0) {
      startTime = timestamp;
      currentSplitStartTime = timestamp;
    }
    endTime = timestamp;

    // 2. Distance
    const distNode = point.querySelector("DistanceMeters");
    const dist = distNode ? parseFloat(distNode.textContent || "0") : 0;
    
    // Check for cumulative distance validity
    if (dist > totalDistance) {
      totalDistance = dist;
    }

    // 3. Heart Rate
    const hrNode = point.querySelector("HeartRateBpm > Value");
    let hr = 0;
    if (hrNode) {
      hr = parseInt(hrNode.textContent || "0");
      if (hr > 0) {
        heartRateSum += hr;
        heartRateCount++;
        if (hr > maxHr) maxHr = hr;
        
        currentSplitHrSum += hr;
        currentSplitHrCount++;
      }
    }

    // 4. Elevation
    const altNode = point.querySelector("AltitudeMeters");
    let alt = 0;
    if (altNode) {
      alt = parseFloat(altNode.textContent || "0");
      if (lastAltitude !== -9999 && alt > lastAltitude) {
        elevationGain += (alt - lastAltitude);
      }
      lastAltitude = alt;
    }

    // Store raw point for best efforts
    rawPoints.push({ time: timestamp, dist });

    // 5. Sampling for charts
    if (index % sampleRate === 0 || index === trackpoints.length - 1) {
       // Calculate instant pace (very rough estimate based on previous sampled point)
       let pace = 0;
       if (seriesSample.length > 0) {
         const prev = seriesSample[seriesSample.length - 1];
         const dDist = dist - prev.dist;
         // dTime needs to be calculated from raw point index, but we can approximate using the timestamps if we tracked them in DataPoint
         // For simplicity, let's assume sampleRate is uniform enough or just use 0 for first point
       }
       seriesSample.push({ dist, ele: alt, hr, pace: 0 }); // Placeholder pace, calculation is noisy on raw GPS
    }

    // 6. Split Logic (Every 1000m)
    if (totalDistance >= splitIndex * 1000) {
      const splitDuration = (timestamp - currentSplitStartTime) / 1000; // seconds
      const splitAvgHr = currentSplitHrCount > 0 ? Math.round(currentSplitHrSum / currentSplitHrCount) : 0;
      
      splits.push({
        kilometer: splitIndex,
        timeSeconds: splitDuration,
        avgHr: splitAvgHr
      });

      splitIndex++;
      currentSplitStartTime = timestamp;
      currentSplitHrSum = 0;
      currentSplitHrCount = 0;
    }
  });

  // Post-Process: Calculate Pace for Series (Smoothing)
  for (let i = 1; i < seriesSample.length; i++) {
     const dDist = seriesSample[i].dist - seriesSample[i-1].dist;
     // We need time difference. Since we didn't store time in DataPoint to save space, 
     // we can estimate based on total duration / points, BUT better to just leave it 0 if we can't be accurate.
     // To fix this properly for the graph:
     // Let's assume uniform time distribution for the graph x-axis if we plot by index, 
     // but plotting by distance is better.
     // Let's just store pace as 0 for now in this restricted parser to avoid complexity errors without time tracking in DataPoint.
     // Actually, let's calculate pace from splits for the graph? No, splits are too coarse.
  }

  const totalDurationSeconds = (endTime - startTime) / 1000;
  const avgHr = heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : 0;
  const avgPaceSecondsPerKm = totalDistance > 0 ? (totalDurationSeconds / (totalDistance / 1000)) : 0;

  // Calculate Training Load (TRIMP-ish)
  // Simple formula: Duration (mins) * Avg HR / Max HR (assumed generic 190 if not passed, but we use internal max)
  // This produces a "Score" relative to effort.
  const safeMaxHr = maxHr > 0 ? maxHr : 190;
  const trainingLoadScore = Math.round((totalDurationSeconds / 60) * (avgHr / safeMaxHr) * 10); 

  // Calculate Best Efforts (1k, 5k, 10k)
  const bestEfforts: BestEffort[] = [];
  const targets = [1000, 5000, 10000];
  
  targets.forEach(targetDist => {
    if (totalDistance >= targetDist) {
      let bestTime = Infinity;
      // Sliding window
      let left = 0;
      for (let right = 0; right < rawPoints.length; right++) {
        const d = rawPoints[right].dist - rawPoints[left].dist;
        if (d >= targetDist) {
          // Shrink window from left until just under targetDist
          while (rawPoints[right].dist - rawPoints[left + 1].dist >= targetDist) {
            left++;
          }
          const t = (rawPoints[right].time - rawPoints[left].time) / 1000;
          if (t < bestTime) bestTime = t;
        }
      }
      if (bestTime !== Infinity) {
        bestEfforts.push({
          distanceLabel: targetDist === 1000 ? "1k" : targetDist === 5000 ? "5k" : "10k",
          timeSeconds: bestTime,
          paceSeconds: bestTime / (targetDist / 1000)
        });
      }
    }
  });

  return {
    totalDistanceMeters: totalDistance,
    totalDurationSeconds: totalDurationSeconds,
    avgHr,
    maxHr,
    elevationGain,
    avgPaceSecondsPerKm,
    trainingLoadScore,
    splits,
    bestEfforts,
    seriesSample
  };
};

// Helper for display
export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatPace = (secondsPerKm: number): string => {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"/km`;
};