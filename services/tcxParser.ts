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

  // Activity Totals (Try to find them in the header first)
  const caloriesNode = xmlDoc.querySelector("Calories");
  const totalCalories = caloriesNode ? parseInt(caloriesNode.textContent || "0") : undefined;

  let totalDistance = 0;
  let startTime = 0;
  let endTime = 0;
  
  let heartRateSum = 0;
  let heartRateCount = 0;
  let maxHr = 0;
  
  let cadenceSum = 0;
  let cadenceCount = 0;

  let elevationGain = 0;
  let lastAltitude = -9999;

  // Split calculation variables
  const splits: TcxSplit[] = [];
  let currentSplitStartTime = 0;
  let currentSplitHrSum = 0;
  let currentSplitHrCount = 0;
  let currentSplitCadenceSum = 0;
  let currentSplitCadenceCount = 0;
  let lastSplitDistance = 0;
  let splitIndex = 1;

  // Sampling for charts (Target ~150 points)
  const sampleRate = Math.max(1, Math.floor(trackpoints.length / 150));
  const seriesSample: DataPoint[] = [];

  // Best Effort Calculation Variables
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

    // 4. Cadence (RunCadence or Cadence)
    // RunCadence usually maxes at ~200 (steps per min). Bike Cadence maxes ~120 (rpm).
    // Garmin often uses RunCadence which is steps/min divided by 2 sometimes, or full steps.
    // Standard TCX schema often puts it in <Extensions><TPX><RunCadence>
    let cad = 0;
    const runCadenceNode = point.querySelector("RunCadence");
    const cadenceNode = point.querySelector("Cadence"); // sometimes used for cycling or generic
    
    if (runCadenceNode) {
       cad = parseInt(runCadenceNode.textContent || "0");
       // Sometimes RunCadence is steps per minute (spm) or full cycles. We assume SPM.
    } else if (cadenceNode) {
       cad = parseInt(cadenceNode.textContent || "0");
       // Often for running this might be RPM (one foot), so * 2 might be needed, but let's stick to raw.
    }

    if (cad > 0) {
      cadenceSum += cad;
      cadenceCount++;
      currentSplitCadenceSum += cad;
      currentSplitCadenceCount++;
    }

    // 5. Elevation
    const altNode = point.querySelector("AltitudeMeters");
    let alt = 0;
    if (altNode) {
      alt = parseFloat(altNode.textContent || "0");
      if (lastAltitude !== -9999 && alt > lastAltitude) {
         // Simple filter for noise: only count if > 0.2m change
         if ((alt - lastAltitude) > 0.2) {
            elevationGain += (alt - lastAltitude);
         }
      }
      lastAltitude = alt;
    }

    // Store raw point for best efforts
    rawPoints.push({ time: timestamp, dist });

    // 6. Sampling for charts
    if (index % sampleRate === 0 || index === trackpoints.length - 1) {
       seriesSample.push({ dist, ele: alt, hr, pace: 0, cadence: cad }); 
    }

    // 7. Split Logic (Every 1000m)
    if (totalDistance >= splitIndex * 1000) {
      const splitDuration = (timestamp - currentSplitStartTime) / 1000; // seconds
      const splitAvgHr = currentSplitHrCount > 0 ? Math.round(currentSplitHrSum / currentSplitHrCount) : 0;
      const splitAvgCadence = currentSplitCadenceCount > 0 ? Math.round(currentSplitCadenceSum / currentSplitCadenceCount) : 0;
      const splitDist = totalDistance - lastSplitDistance; // Should be ~1000
      
      // Calculate pace for split
      const splitPace = splitDuration / (splitDist / 1000);

      splits.push({
        kilometer: splitIndex,
        timeSeconds: splitDuration,
        avgHr: splitAvgHr,
        avgPaceSeconds: splitPace,
        avgCadence: splitAvgCadence
      });

      splitIndex++;
      lastSplitDistance = totalDistance;
      currentSplitStartTime = timestamp;
      currentSplitHrSum = 0;
      currentSplitHrCount = 0;
      currentSplitCadenceSum = 0;
      currentSplitCadenceCount = 0;
    }
  });

  const totalDurationSeconds = (endTime - startTime) / 1000;
  const avgHr = heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : 0;
  const avgCadence = cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : undefined;
  const avgPaceSecondsPerKm = totalDistance > 0 ? (totalDurationSeconds / (totalDistance / 1000)) : 0;

  // Calculate Training Load (TRIMP-ish)
  const safeMaxHr = maxHr > 0 ? maxHr : 190;
  const trainingLoadScore = Math.round((totalDurationSeconds / 60) * (avgHr / safeMaxHr) * 10); 

  // Calculate Best Efforts (1k, 5k, 10k)
  const bestEfforts: BestEffort[] = [];
  const targets = [1000, 5000, 10000];
  
  targets.forEach(targetDist => {
    if (totalDistance >= targetDist) {
      let bestTime = Infinity;
      let left = 0;
      for (let right = 0; right < rawPoints.length; right++) {
        const d = rawPoints[right].dist - rawPoints[left].dist;
        if (d >= targetDist) {
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
    avgCadence,
    elevationGain,
    avgPaceSecondsPerKm,
    trainingLoadScore,
    totalCalories,
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
