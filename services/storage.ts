import { AthleteProfile, ReadinessData, WorkoutAnalysis, AppSettings, TrainingPlan } from "../types";

const KEYS = {
  PROFILE: 'liquidrun_profile',
  READINESS: 'liquidrun_readiness',
  HISTORY: 'liquidrun_history',
  SETTINGS: 'liquidrun_settings',
  PLAN: 'liquidrun_plan',
  PLAN_PREFS: 'liquidrun_plan_prefs'
};

export const saveProfile = (data: AthleteProfile) => {
  try {
    localStorage.setItem(KEYS.PROFILE, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save profile", e);
  }
};

export const loadProfile = (): AthleteProfile | null => {
  try {
    const data = localStorage.getItem(KEYS.PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const saveReadiness = (data: ReadinessData) => {
  try {
    localStorage.setItem(KEYS.READINESS, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save readiness", e);
  }
};

export const loadReadiness = (): ReadinessData | null => {
  try {
    const data = localStorage.getItem(KEYS.READINESS);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const saveHistory = (data: WorkoutAnalysis[]) => {
  try {
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save history", e);
  }
};

export const loadHistory = (): WorkoutAnalysis[] => {
  try {
    const data = localStorage.getItem(KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveSettings = (data: AppSettings) => {
  try {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save settings", e);
  }
};

export const loadSettings = (): AppSettings => {
  try {
    const data = localStorage.getItem(KEYS.SETTINGS);
    return data ? JSON.parse(data) : { themeColor: 'cyan' };
  } catch (e) {
    return { themeColor: 'cyan' };
  }
};

export const savePlan = (data: TrainingPlan | null) => {
  try {
    if (data) {
      localStorage.setItem(KEYS.PLAN, JSON.stringify(data));
    } else {
      localStorage.removeItem(KEYS.PLAN);
    }
  } catch (e) {
    console.error("Failed to save plan", e);
  }
};

export const loadPlan = (): TrainingPlan | null => {
  try {
    const data = localStorage.getItem(KEYS.PLAN);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const savePlanPrefs = (data: { longRunDay: string; workoutDay: string; notes: string }) => {
  try {
    localStorage.setItem(KEYS.PLAN_PREFS, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save plan prefs", e);
  }
};

export const loadPlanPrefs = () => {
  try {
    const data = localStorage.getItem(KEYS.PLAN_PREFS);
    return data ? JSON.parse(data) : { longRunDay: 'Sunday', workoutDay: 'Tuesday', notes: '' };
  } catch (e) {
    return { longRunDay: 'Sunday', workoutDay: 'Tuesday', notes: '' };
  }
};
