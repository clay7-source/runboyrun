import { GoogleGenAI, Type } from "@google/genai";
import { AthleteProfile, AnalysisType, TrainingPlan } from "../types";
import { parseTcxFileContent, formatDuration, formatPace } from "./tcxParser";

// Initialize Gemini Client
// The API key must be obtained exclusively from the environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to convert file to base64
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

export const analyzeVitals = async (file: File, profile: AthleteProfile, todaysPlannedWorkout?: string) => {
  const imagePart = await fileToGenerativePart(file);
  const context = getKarvonenContext(profile);
  
  let planContext = "";
  if (todaysPlannedWorkout) {
    planContext = `
      IMPORTANT CONTEXT:
      The user has a scheduled training plan. 
      TODAY'S SCHEDULED WORKOUT IS: "${todaysPlannedWorkout}".
      
      Your task is to either CONFIRM this workout if their readiness is high, 
      or MODIFY/REDUCE it if their readiness is low.
    `;
  }

  const prompt = `
    You are an expert running coach and physiologist. 
    Analyze this image of morning vitals (HRV, RHR, Sleep, etc.).
    
    ${context}
    ${planContext}

    Based on the visible data and the athlete's specific goals and history:
    1. Determine a readiness score (0-100).
    2. Determine the training status (Recovery, Maintenance, Ready to Train, Peak).
    3. Provide a concise summary of their physiological state.
    4. Recommend the INTENSITY and TYPE of run they should do today. 
       *Crucial:* If they are fatigued, suggest REST or Active Recovery regardless of the plan. 
       If they are ready, endorse the planned workout or suggest one that aligns with their '${profile.runningGoal}'.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [imagePart, { text: prompt }]
    },
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

export const analyzeWorkoutImage = async (file: File, profile: AthleteProfile, readinessContext?: string) => {
  const imagePart = await fileToGenerativePart(file);
  const context = getKarvonenContext(profile);

  const prompt = `
    You are an elite running coach. Analyze this workout screenshot (Strava/Apple Watch/Garmin).
    
    ${context}
    ${readinessContext || ""}

    1. Extract key metrics if visible (Distance, Time, Pace, Avg HR).
    2. Provide "Coach's Feedback": Compare their effort (HR Zones) to the outcome. Did they adhere to a purpose?
       ${readinessContext ? "CRITICAL: You must cross-reference their specific morning readiness/recovery state provided above. Did they listen to their body? If they had poor sleep/recovery but ran hard, warn them. If they were fresh and ran hard, praise them." : ""}
    3. Suggest a specific "Next Workout" that helps them towards their goal of '${profile.runningGoal}'.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [imagePart, { text: prompt }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          distance: { type: Type.STRING },
          duration: { type: Type.STRING },
          avgPace: { type: Type.STRING },
          avgHr: { type: Type.INTEGER },
          aiCoachFeedback: { type: Type.STRING },
          nextWorkoutSuggestion: { type: Type.STRING },
        },
        required: ["aiCoachFeedback", "nextWorkoutSuggestion"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const analyzeTcxFile = async (file: File, profile: AthleteProfile, readinessContext?: string) => {
  // 1. DETERMINISTIC PARSING (Code Only)
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const parsedData = parseTcxFileContent(text);

  // 2. AI COACHING (Uses Parsed Data)
  const context = getKarvonenContext(profile);
  
  // Create a clean JSON summary for the AI
  const runSummary = {
    totalDistanceKm: (parsedData.totalDistanceMeters / 1000).toFixed(2),
    duration: formatDuration(parsedData.totalDurationSeconds),
    avgPace: formatPace(parsedData.avgPaceSecondsPerKm),
    avgHr: parsedData.avgHr,
    maxHr: parsedData.maxHr,
    elevationGain: parsedData.elevationGain,
    splits: parsedData.splits.map(s => `Km ${s.kilometer}: ${formatDuration(s.timeSeconds)} (${s.avgHr}bpm)`).join('\n')
  };

  const prompt = `
    You are an elite running coach. I have mathematically parsed a TCX file for you. 
    Here is the exact data from the run:
    
    ${JSON.stringify(runSummary, null, 2)}
    
    ${context}
    ${readinessContext || ""}

    Task:
    1. Provide "Coach's Feedback": Analyze the splits and heart rate drift. 
       Was this a steady effort? Did they blow up? 
       Does this align with a goal of '${profile.runningGoal}'?
       ${readinessContext ? "CRITICAL: You must cross-reference their specific morning readiness/recovery state provided above. Did they listen to their body? If they had poor sleep/recovery but ran hard, warn them about injury risk or adaptability." : ""}
    2. Suggest "Next Workout": Based on the fatigue indicated by this session and their long term goal.
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
          aiCoachFeedback: { type: Type.STRING },
          nextWorkoutSuggestion: { type: Type.STRING },
        },
        required: ["aiCoachFeedback", "nextWorkoutSuggestion"]
      }
    }
  });

  const aiResult = JSON.parse(response.text || '{}');

  // Merge Deterministic Data with AI Insights
  return {
    ...aiResult,
    distance: `${(parsedData.totalDistanceMeters / 1000).toFixed(2)} km`,
    duration: formatDuration(parsedData.totalDurationSeconds),
    avgPace: formatPace(parsedData.avgPaceSecondsPerKm),
    avgHr: parsedData.avgHr,
    parsedData: parsedData // Pass the full object for UI visualization
  };
};

export const generateTrainingPlan = async (
  profile: AthleteProfile, 
  preferences: { longRunDay: string; workoutDay: string; notes: string }
): Promise<TrainingPlan> => {
  const context = getKarvonenContext(profile);
  
  const prompt = `
    Create a 4-week structured running training plan for this athlete:
    ${context}

    USER PREFERENCES:
    - Preferred Long Run Day: ${preferences.longRunDay}
    - Preferred Workout/Interval Day: ${preferences.workoutDay}
    - Specific Notes/Requests: "${preferences.notes}"

    The plan should be specific, progressive, and geared towards their goal: "${profile.runningGoal}".
    Respect the preferred days where possible.
    
    Output a JSON object with:
    - goal: String summary of the plan's focus
    - durationWeeks: 4
    - schedule: An array of workouts. Each workout must have:
      - week: number (1-4)
      - day: number (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun)
      - title: Short name (e.g. "Long Run", "Intervals", "Rest")
      - description: Specific details (e.g. "5x1k @ 4:00/km with 2min rest")
      - type: One of "Run", "Rest", "Cross", "Long Run", "Intervals"
      - distanceKm: Estimated distance (number, optional, 0 if rest/cross)
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
                day: { type: Type.INTEGER },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING },
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
  
  // Calculate Start Date (Most recent Monday)
  const now = new Date();
  const day = now.getDay() || 7; // 1-7 (Mon-Sun)
  if (day !== 1) now.setHours(-24 * (day - 1)); // Go back to Monday
  now.setHours(0, 0, 0, 0);

  return {
    id: Date.now().toString(),
    createdAt: Date.now(),
    startDate: now.getTime(),
    goal: result.goal,
    durationWeeks: result.durationWeeks,
    schedule: result.schedule
  };
};
