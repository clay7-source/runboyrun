import { GoogleGenAI, Type } from "@google/genai";
import { AthleteProfile, AnalysisType, TrainingPlan } from "../types";
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
 * The Master System Prompt for the AI Coach Layer
 */
const COACHING_SYSTEM_PROMPT = `
You are the AI coaching layer of a local-first running coach application called “Run Boy Run”.

Your role is NOT to calculate metrics.
Your role is to INTERPRET, CONNECT, and EXPLAIN decisions made by deterministic code.

You must think like an experienced endurance running coach.

==================================================
CORE PHILOSOPHY
==================================================
1. Training is a continuous system, not isolated workouts.
2. Morning readiness affects today’s execution, not long-term structure.
3. The training plan defines intent; daily context defines adjustment.
4. Consistency and recovery matter more than hero workouts.
5. All recommendations must be conservative, explainable, and practical.

==================================================
HARD RULES (NON-NEGOTIABLE)
==================================================
- You MUST NOT change distances, volume, or workout structure.
- You MUST NOT invent or recalculate metrics.
- You MUST NOT override recovery or safety decisions made by code.
- You MUST NOT use medical or diagnostic language.
- You MUST treat all biometric interpretation as ESTIMATED and CONTEXTUAL.

==================================================
IDENTITY & VOICE
==================================================
- Calm, experienced endurance coach.
- Practical, not hype-driven.
- Supportive, not authoritarian.
`;

export const analyzeVitals = async (files: File[], profile: AthleteProfile, todaysPlannedWorkout?: string) => {
  // Convert all files to generative parts
  const imageParts = await Promise.all(files.map(f => fileToGenerativePart(f)));
  const context = getKarvonenContext(profile);
  
  let planContext = "";
  if (todaysPlannedWorkout) {
    planContext = `
      CONTEXT - SCHEDULED WORKOUT: "${todaysPlannedWorkout}"
    `;
  } else {
    planContext = "CONTEXT - SCHEDULED WORKOUT: None / Rest / Unscheduled";
  }

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}

    TASK: MORNING DECISION (BEFORE RUN)
    
    Analyze these images of morning vitals (HRV, RHR, Sleep, etc.).
    
    ATHLETE CONTEXT:
    ${context}
    ${planContext}

    Apply the "MORNING DECISION" responsibility:
    - Does today’s readiness SUPPORT the planned intent?
    - Should the runner PROTECT the session (reduce intensity, keep distance) or EXECUTE as planned?
    
    Note: You may recommend holding the run strictly in Zone 2 or focusing on form, but DO NOT cancel the workout unless it is already a rest day.

    Based on the visible data across all images and the athlete's specific goals and history:
    1. Determine a readiness score (0-100).
    2. Determine the training status (Recovery, Maintenance, Ready to Train, Peak).
    3. Construct the JSON output carefully:
       - "summary": Combine "Today's Context" (Readiness + Plan) and "Why It Matters" (Big picture implication).
       - "recommendation": Combine "What to Do Today" (Execution cues) and "Coach's Note" (Supportive closing).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [...imageParts, { text: prompt }]
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

export const analyzeWorkoutImage = async (files: File[], profile: AthleteProfile, readinessContext?: string) => {
  // Convert all files to generative parts
  const imageParts = await Promise.all(files.map(f => fileToGenerativePart(f)));
  const context = getKarvonenContext(profile);

  const prompt = `
    ${COACHING_SYSTEM_PROMPT}

    TASK: POST-RUN INTEGRATION (Image Analysis)
    Analyze these workout screenshots (Strava/Apple Watch/Garmin/TrainingPeaks).
    
    ATHLETE CONTEXT:
    ${context}
    ${readinessContext || "Readiness Context: Unknown"}

    1. Extract key metrics if visible (Total Distance, Total Time, Avg Pace, Avg HR). Prioritize the most accurate summary data found.
    
    Apply the "POST-RUN INTEGRATION" responsibility:
    - Connect what just happened to the big picture.
    - If metrics are visible, use them to explain (do not invent).
    - If performance exceeded expectations: Praise restraint.
    - If performance underwhelmed: Normalize it, emphasize adaptation.

    Construct the JSON output:
    - "aiCoachFeedback": Combine "Today's Context" (How it fit the plan) and "Why It Matters" (Impact on fitness/recovery).
    - "nextWorkoutSuggestion": Combine "What to Do Next" (Recovery/Focus) and "Coach's Note" (Supportive closing).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [...imageParts, { text: prompt }]
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
    ${COACHING_SYSTEM_PROMPT}

    TASK: POST-RUN INTEGRATION (TCX Analysis)
    I have mathematically parsed a TCX file. INTERPRET this data.
    
    RUN DATA:
    ${JSON.stringify(runSummary, null, 2)}
    
    ATHLETE CONTEXT:
    ${context}
    ${readinessContext || "Readiness Context: Unknown"}

    Apply the "POST-RUN INTEGRATION" responsibility:
    - Connect the splits and HR drift to the big picture.
    - Did they support fitness, recovery, or consistency?
    - If performance exceeded expectations: Praise restraint.
    - If performance underwhelmed: Normalize it, emphasize adaptation.

    Construct the JSON output:
    - "aiCoachFeedback": Combine "Today's Context" (How it fit the plan) and "Why It Matters" (Impact on fitness/recovery).
    - "nextWorkoutSuggestion": Combine "What to Do Next" (Recovery/Focus) and "Coach's Note" (Supportive closing).
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
    ${COACHING_SYSTEM_PROMPT}

    TASK: PLAN GENERATION
    Create a 4-week structured running training plan for this athlete.

    ATHLETE CONTEXT:
    ${context}

    USER PREFERENCES:
    - Preferred Long Run Day: ${preferences.longRunDay}
    - Preferred Workout/Interval Day: ${preferences.workoutDay}
    - Specific Notes/Requests: "${preferences.notes}"

    RULES:
    - The plan should be specific, progressive, and geared towards their goal: "${profile.runningGoal}".
    - Respect the preferred days where possible.
    - Ensure consistency and recovery matter more than hero workouts.
    
    Output a JSON object with:
    - goal: String summary of the plan's focus
    - durationWeeks: 4
    - schedule: An array of workouts.
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
