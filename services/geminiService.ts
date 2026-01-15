import { GoogleGenAI, Type } from "@google/genai";
import { AthleteProfile, AnalysisType, TrainingPlan, ExtendedAnalysis } from "../types";
import { parseTcxFileContent, formatDuration, formatPace } from "./tcxParser";

// Initialize Gemini Client
// The API key must be obtained exclusively from the environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to convert file to generative part
 */
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      const base64Content = base64Data.split(',')[1];
      resolve({
        inlineData: {
          data: base64Content,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Returns the current system date and time string for AI context.
 */
const getCurrentTemporalContext = (): string => {
  const now = new Date();
  return `
    TEMPORAL CONTEXT (System Time):
    - Current Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    - Current Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
  `;
};

/**
 * Calculates Karvonen HR Zones for context
 */
const getKarvonenContext = (profile: AthleteProfile): string => {
  if (!profile.isConfigured) return "User profile is not fully configured.";
  
  const hrr = profile.maxHr - profile.restingHr;
  const z2Min = Math.round(hrr * 0.6 + profile.restingHr);
  const z2Max = Math.round(hrr * 0.7 + profile.restingHr);
  const z4Min = Math.round(hrr * 0.8 + profile.restingHr);
  const z4Max = Math.round(hrr * 0.9 + profile.restingHr);

  return `
    ATHLETE PROFILE:
    - Gender: ${profile.gender}
    - Age: ${profile.age}
    - Weight: ${profile.weight}kg
    - Max HR: ${profile.maxHr} bpm
    - Resting HR: ${profile.restingHr} bpm
    - Primary Goal: ${profile.runningGoal}
    - Typical Weekly Volume: ${profile.weeklyMileage} km
    - Personal Bests/History: ${profile.personalBests || "None listed"}
    
    PHYSIOLOGY REFERENCE (Karvonen):
    - Zone 2 (Easy/Endurance): ${z2Min}-${z2Max} bpm
    - Zone 4 (Threshold): ${z4Min}-${z4Max} bpm
  `;
};

/**
 * Calculates Estimated VO2 Max for a specific run based on ACSM formulas and Swain et al. HR reserve method.
 */
const calculateEstimatedVO2Max = (
  avgPaceSecondsPerKm: number,
  avgHr: number,
  maxHr: number,
  elevationGain: number,
  totalDistance: number
): number | null => {
  if (!avgPaceSecondsPerKm || !avgHr || !maxHr || avgHr < 40) return null;

  // 1. Calculate Speed in meters/min
  const speedMetersPerMin = 1000 / (avgPaceSecondsPerKm / 60);

  // 2. Calculate Grade (fraction)
  const grade = totalDistance > 0 ? Math.max(0, elevationGain / totalDistance) : 0;

  // 3. Calculate Oxygen Cost (VO2) of the running velocity (ACSM Formula)
  // VO2 (ml/kg/min) = 0.2 * speed + 0.9 * speed * grade + 3.5
  const vo2Cost = (0.2 * speedMetersPerMin) + (0.9 * speedMetersPerMin * grade) + 3.5;

  // 4. Calculate %HR Max
  const percentHrMax = avgHr / maxHr;

  // Filter out data that is too low intensity (unreliable for VO2 max prediction)
  if (percentHrMax < 0.60) return null;

  // 5. Convert %HR Max to %VO2 Max (Swain et al.)
  // %HRmax = 0.64 * %VO2max + 0.37  =>  %VO2max = (%HRmax - 0.37) / 0.64
  const percentVo2Max = (percentHrMax - 0.37) / 0.64;

  if (percentVo2Max <= 0 || percentVo2Max > 1.2) return null; // Sanity check

  // 6. Extrapolate to VO2 Max
  const estimatedVo2Max = vo2Cost / percentVo2Max;

  return Math.round(estimatedVo2Max);
};

/**
 * The Master System Prompt for the AI Coach Layer
 */
const COACHING_SYSTEM_PROMPT = `
You are the Senior Sports Scientist and Head Coach of "Run Boy Run".
Your analysis must be deeper than a standard fitness app. You don't just report numbers; you calculate efficiency, estimate strain, and judge quality.

==================================================
ANALYSIS PHILOSOPHY
==================================================
1. **Holistic View**: Use every data point (Cadence, Elevation, HR Drift) to build a picture of the athlete's biology.
2. **Quality over Quantity**: A short run with perfect execution is better than a long junk mile run. Score accordingly.
3. **Form Inference**: Use Cadence and Pace to infer stride efficiency. (e.g., Low cadence + Fast pace = High impact forces).
4. **Recovery Science**: Estimate recovery time based on intensity (HR zones) and duration.
5. **VO2 Max Estimation**: Use the relationship between pace (work output) and Heart Rate (physiological cost) to estimate current VO2 Max capacity.

==================================================
IDENTITY & VOICE
==================================================
- Professional, insightful, precise.
- You explain *why* something happened. (e.g., "Your HR spiked at km 4 likely due to the elevation gain combined with a cadence drop.")
`;

// Define the ExtendedAnalysis Schema for Gemini
const extendedAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A creative, short summary title for the workout" },
    summary: { type: Type.STRING, description: "Executive summary of the session performance" },
    effortScore: { type: Type.INTEGER, description: "RPE 1-10" },
    qualityScore: { type: Type.INTEGER, description: "0-100 Score based on execution vs implied goal" },
    vo2MaxEstimate: { type: Type.INTEGER, description: "Estimated VO2 Max for this specific session based on Pace/HR ratio" },
    trainingEffect: { type: Type.STRING, description: "e.g., Base, Tempo, VO2 Max, Recovery" },
    recoveryTimeHours: { type: Type.INTEGER, description: "Estimated hours until fully recovered" },
    hydrationEstimateMl: { type: Type.INTEGER, description: "Estimated fluid loss in ml" },
    keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
    formAnalysis: { type: Type.STRING, description: "Analysis of cadence, stride, and efficiency" },
    pacingAnalysis: { type: Type.STRING, description: "Analysis of splits and consistency" },
    coachFeedback: { type: Type.STRING, description: "Overall feedback text" },
    nextWorkoutSuggestion: { type: Type.STRING, description: "Specific recommendation for next session" },
    // Data extraction fields (for screenshots)
    extractedDistance: { type: Type.STRING },
    extractedDuration: { type: Type.STRING },
    extractedPace: { type: Type.STRING },
    extractedHr: { type: Type.INTEGER },
    extractedCadence: { type: Type.INTEGER },
    extractedElevation: { type: Type.INTEGER },
    extractedCalories: { type: Type.INTEGER },
  },
  required: ["title", "summary", "effortScore", "qualityScore", "trainingEffect", "recoveryTimeHours", "hydrationEstimateMl", "keyStrengths", "areasForImprovement", "formAnalysis", "pacingAnalysis", "coachFeedback", "nextWorkoutSuggestion"]
};

export const analyzeManualSleep = async (
  sleepHours: number,
  profile: AthleteProfile,
  todaysPlannedWorkout?: string,
  recentHistoryContext?: string,
  previousReadinessContext?: string
) => {
  const context = getKarvonenContext(profile);
  const temporalContext = getCurrentTemporalContext();
  
  let planContext = todaysPlannedWorkout ? `CONTEXT - SCHEDULED WORKOUT: "${todaysPlannedWorkout}"` : "CONTEXT - SCHEDULED WORKOUT: None / Rest / Unscheduled";
  const historyContextString = recentHistoryContext || "None available.";
  const readinessContextString = previousReadinessContext || "None available.";

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}
    TASK: MANUAL MORNING READINESS CHECK
    The user has manually reported their sleep duration.
    
    INPUT:
    - Reported Sleep Duration: ${sleepHours} hours
    
    ${temporalContext}
    ATHLETE: ${context}
    PLAN: ${planContext}
    HISTORY: ${historyContextString}
    PREVIOUS READINESS: ${readinessContextString}

    Assess readiness (0-100) based primarily on the sleep duration, but considering the athlete's age, load, and scheduled workout.
    - < 6 hours is generally detrimental.
    - 7-8 hours is baseline.
    - > 9 hours is excellent.
    - Adjust if they are older or have high training load.
    
    Provide a score, status, summary, and recommendation.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          status: { type: Type.STRING },
          summary: { type: Type.STRING },
          recommendation: { type: Type.STRING },
        },
        required: ["score", "status", "summary", "recommendation"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const analyzeVitals = async (
  files: File[], 
  profile: AthleteProfile, 
  todaysPlannedWorkout?: string, 
  recentHistoryContext?: string,
  previousReadinessContext?: string
) => {
  const imageParts = await Promise.all(files.map(f => fileToGenerativePart(f)));
  const context = getKarvonenContext(profile);
  const temporalContext = getCurrentTemporalContext();
  
  let planContext = todaysPlannedWorkout ? `CONTEXT - SCHEDULED WORKOUT: "${todaysPlannedWorkout}"` : "CONTEXT - SCHEDULED WORKOUT: None / Rest / Unscheduled";
  const historyContextString = recentHistoryContext || "None available.";
  const readinessContextString = previousReadinessContext || "None available.";

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}
    TASK: MORNING READINESS SCAN
    Analyze these vitals.
    
    ${temporalContext}
    ATHLETE: ${context}
    PLAN: ${planContext}
    HISTORY: ${historyContextString}
    PREVIOUS: ${readinessContextString}

    Assess readiness (0-100) and provide a recommendation.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          status: { type: Type.STRING },
          summary: { type: Type.STRING },
          recommendation: { type: Type.STRING },
        },
        required: ["score", "status", "summary", "recommendation"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const analyzeWorkoutImage = async (files: File[], profile: AthleteProfile, readinessContext?: string, recentHistoryContext?: string) => {
  const imageParts = await Promise.all(files.map(f => fileToGenerativePart(f)));
  const context = getKarvonenContext(profile);
  const temporalContext = getCurrentTemporalContext();
  const historyContextString = recentHistoryContext || "None available.";

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}

    TASK: DEEP DIVE WORKOUT ANALYSIS (From Screenshots)
    Analyze these workout screenshots (Strava/Apple/Garmin).
    
    ${temporalContext}
    ATHLETE: ${context}
    READINESS: ${readinessContext || "Unknown"}
    HISTORY: ${historyContextString}

    1. **Data Extraction**: Extract EVERY visible number. Distance, Time, Pace, HR, Cadence (SPM), Elevation, Calories, Zones.
    2. **Inference**: If Cadence isn't visible, infer it from the description or typical values for this pace/profile (mark as estimated).
    3. **Deep Analysis**: Fill out the Extended Analysis schema. 
    4. **VO2 Max**: Estimate the VO2 Max for this run using the extracted Avg Pace and Avg HR vs Max HR. Use standard running formulas.

    Output the full extended analysis object.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: extendedAnalysisSchema
    }
  });

  const result = JSON.parse(response.text || '{}');

  return {
    distance: result.extractedDistance,
    duration: result.extractedDuration,
    avgPace: result.extractedPace,
    avgHr: result.extractedHr,
    avgCadence: result.extractedCadence,
    elevationGain: result.extractedElevation,
    calories: result.extractedCalories,
    aiCoachFeedback: result.coachFeedback, // Legacy mapping
    nextWorkoutSuggestion: result.nextWorkoutSuggestion, // Legacy mapping
    extendedAnalysis: result
  };
};

export const analyzeTcxFile = async (file: File, profile: AthleteProfile, readinessContext?: string, recentHistoryContext?: string) => {
  // 1. DETERMINISTIC PARSING
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const parsedData = parseTcxFileContent(text);
  const temporalContext = getCurrentTemporalContext();
  const context = getKarvonenContext(profile);
  const historyContextString = recentHistoryContext || "None available.";
  
  // 2. CALCULATE VO2 MAX ESTIMATE (Deterministic)
  let calculatedVo2Max = null;
  if (profile.isConfigured && profile.maxHr) {
    calculatedVo2Max = calculateEstimatedVO2Max(
      parsedData.avgPaceSecondsPerKm,
      parsedData.avgHr,
      profile.maxHr,
      parsedData.elevationGain,
      parsedData.totalDistanceMeters
    );
  }

  // 3. PREPARE DEEP SUMMARY FOR AI
  const runSummary = {
    metrics: {
        distance: (parsedData.totalDistanceMeters / 1000).toFixed(2) + " km",
        duration: formatDuration(parsedData.totalDurationSeconds),
        avgPace: formatPace(parsedData.avgPaceSecondsPerKm),
        avgHr: parsedData.avgHr,
        maxHr: parsedData.maxHr,
        elevationGain: parsedData.elevationGain,
        avgCadence: parsedData.avgCadence,
        calories: parsedData.totalCalories,
        calculatedVo2MaxEstimate: calculatedVo2Max
    },
    splits: parsedData.splits.map(s => 
        `Km ${s.kilometer}: ${formatDuration(s.timeSeconds)} | HR: ${s.avgHr} | Cadence: ${s.avgCadence || 'N/A'}`
    ).join('\n')
  };

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}

    TASK: DEEP DIVE WORKOUT ANALYSIS (From Parsed TCX Data)
    I have parsed the raw GPS/XML data. Analyze this biological data deeply.
    
    ${temporalContext}

    RAW DATA SUMMARY:
    ${JSON.stringify(runSummary, null, 2)}
    
    ATHLETE: ${context}
    READINESS: ${readinessContext || "Unknown"}
    HISTORY: ${historyContextString}

    Perform the analysis:
    - **Form**: Look at Cadence vs Pace in the splits. Is it low (<165)? Is it consistent?
    - **Pacing**: Look at the split times. Positive or negative split?
    - **Cardiac Drift**: Look at HR in later splits compared to pace.
    - **VO2 Max**: I have calculated an estimate (${calculatedVo2Max || "N/A"}) based on the data. Validate this in your 'vo2MaxEstimate' field, or refine it if you see cardiac drift/elevation issues.

    Generate the Extended Analysis JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: extendedAnalysisSchema
    }
  });

  const aiResult = JSON.parse(response.text || '{}');

  return {
    distance: `${(parsedData.totalDistanceMeters / 1000).toFixed(2)} km`,
    duration: formatDuration(parsedData.totalDurationSeconds),
    avgPace: formatPace(parsedData.avgPaceSecondsPerKm),
    avgHr: parsedData.avgHr,
    avgCadence: parsedData.avgCadence,
    calories: parsedData.totalCalories,
    elevationGain: parsedData.elevationGain,
    
    parsedData: parsedData,
    
    aiCoachFeedback: aiResult.coachFeedback, // Legacy
    nextWorkoutSuggestion: aiResult.nextWorkoutSuggestion, // Legacy
    extendedAnalysis: aiResult // New Rich Data
  };
};

export const generateTrainingPlan = async (
  profile: AthleteProfile, 
  preferences: { longRunDay: string; workoutDay: string; notes: string },
  startDateTimestamp: number
): Promise<TrainingPlan> => {
  const context = getKarvonenContext(profile);
  const temporalContext = getCurrentTemporalContext();
  const startDateObj = new Date(startDateTimestamp);
  const startDayName = startDateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const startDateString = startDateObj.toLocaleDateString();

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}

    TASK: FULL 4-WEEK DAILY SCHEDULE GENERATION
    Create a 4-week structured running training plan for this athlete.
    
    CRITICAL: You must generate a schedule entry for EVERY SINGLE DAY of the 4 weeks (28 days total).
    - If a day is a rest day, the type MUST be "Rest" and the title MUST be "Rest Day".
    - The plan starts on: ${startDateString} (which is a ${startDayName}).
    - Ensure the sequence of days matches the calendar starting from ${startDayName}.
    
    ${temporalContext}

    ATHLETE CONTEXT:
    ${context}

    USER PREFERENCES:
    - Preferred Long Run Day: ${preferences.longRunDay}
    - Preferred Workout/Interval Day: ${preferences.workoutDay}
    - Specific Notes/Requests: "${preferences.notes}"

    Output a JSON object with goal, durationWeeks, and schedule (Array of 28 objects).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          goal: { type: Type.STRING },
          durationWeeks: { type: Type.INTEGER },
          schedule: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                week: { type: Type.INTEGER },
                day: { type: Type.INTEGER, description: "1 = Monday, 7 = Sunday. OR relative day 1-28." },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["Run", "Rest", "Cross", "Long Run", "Intervals", "Tempo"] },
                distanceKm: { type: Type.NUMBER },
              },
              required: ["week", "day", "title", "description", "type"]
            }
          }
        },
        required: ["goal", "durationWeeks", "schedule"]
      }
    }
  });

  const result = JSON.parse(response.text || '{}');
  
  return {
    id: Date.now().toString(),
    createdAt: Date.now(),
    startDate: startDateTimestamp, // Use the user-selected start date
    goal: result.goal,
    durationWeeks: result.durationWeeks,
    schedule: result.schedule
  };
};
