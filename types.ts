export interface AthleteProfile {
  name: string;
  age: number;
  weight: number; // in kg
  gender: 'Male' | 'Female' | 'Other';
  restingHr: number;
  maxHr: number;
  runningGoal: string; // e.g., "Sub 20min 5k", "Marathon Completion"
  weeklyMileage: number; // Average km per week
  personalBests?: string; // Free text or structured, e.g., "5k: 20:00"
  isConfigured: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
}

export interface AppSettings {
  themeColor: 'cyan' | 'purple' | 'orange' | 'green';
}

export interface ReadinessData {
  score: number; // 0-100
  status: 'Recovery' | 'Maintenance' | 'Ready to Train' | 'Peak';
  summary: string;
  recommendation: string;
  lastUpdated: number;
}

export interface ScheduledWorkout {
  week: number;
  day: number; // 1-7
  title: string;
  description: string;
  type: 'Run' | 'Rest' | 'Cross' | 'Long Run' | 'Intervals';
  distanceKm?: number;
}

export interface TrainingPlan {
  id: string;
  createdAt: number;
  startDate: number; // Timestamp of the Monday starting the plan
  goal: string;
  durationWeeks: number;
  schedule: ScheduledWorkout[];
}

export interface TcxSplit {
  kilometer: number;
  timeSeconds: number;
  avgHr: number;
}

export interface DataPoint {
  dist: number; // meters
  ele: number; // meters
  hr: number; // bpm
  pace: number; // seconds per km (instant)
}

export interface BestEffort {
  distanceLabel: string; // "1k", "5k", "10k"
  timeSeconds: number;
  paceSeconds: number;
}

export interface ParsedActivityData {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  avgHr: number;
  maxHr: number;
  elevationGain: number;
  avgPaceSecondsPerKm: number;
  trainingLoadScore: number; // TRIMP-like score
  splits: TcxSplit[];
  bestEfforts: BestEffort[];
  seriesSample: DataPoint[]; // Downsampled series for charts (approx 100-200 points)
}

export interface WorkoutAnalysis {
  id: string;
  type: 'Run' | 'Cycle' | 'Other';
  // Parsed metrics (from TCX or estimated from Screenshot)
  distance?: string; // Display string
  duration?: string; // Display string
  avgPace?: string; // Display string
  avgHr?: number;
  parsedData?: ParsedActivityData; // Specific to TCX
  // AI Generated
  aiCoachFeedback: string;
  nextWorkoutSuggestion: string;
  timestamp: number;
}

export interface HrZone {
  zone: number;
  min: number;
  max: number;
  description: string;
}

export interface BackupData {
  version: number;
  timestamp: number;
  profile: AthleteProfile | null;
  settings: AppSettings;
  readiness: ReadinessData | null;
  history: WorkoutAnalysis[];
  plan: TrainingPlan | null;
  planPrefs: { longRunDay: string; workoutDay: string; notes: string };
}

export enum AnalysisType {
  VITALS = 'VITALS',
  WORKOUT_IMAGE = 'WORKOUT_IMAGE',
  WORKOUT_TCX = 'WORKOUT_TCX'
}
