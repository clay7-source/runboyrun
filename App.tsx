import React, { useState, useEffect } from 'react';
import { AthleteProfile, ReadinessData, WorkoutAnalysis, AnalysisType, HrZone, AppSettings, TrainingPlan, ScheduledWorkout, UserProfile, DataPoint } from './types';
import { analyzeVitals, analyzeWorkoutImage, analyzeTcxFile, generateTrainingPlan, analyzeManualSleep } from './services/geminiService';
import { formatDuration, formatPace } from './services/tcxParser';
import { saveProfile, loadProfile, saveReadiness, loadReadiness, saveHistory, loadHistory, saveSettings, loadSettings, savePlan, loadPlan, savePlanPrefs, loadPlanPrefs, saveUser, loadUser, createBackup, restoreBackup } from './services/storage';
import { GlassCard } from './components/GlassCard';
import { AthleteProfile as ProfileComponent } from './components/AthleteProfile';
import { Activity, Battery, Upload, Zap, ChevronRight, FileCode, ImageIcon, Loader2, TrendingUp, Mountain, History, Calendar, MapPin, Play, Settings, List, X, BarChart, Medal, Flame, Trash2, PlusCircle, CheckCircle, Clock, Cloud, Download, LogOut, ShieldAlert, AlertTriangle, Droplets, Gauge, BrainCircuit, Footprints, ArrowUpRight, ArrowDownRight, Wind, User, BarChart2, MousePointerClick, Moon } from 'lucide-react';

const INITIAL_PROFILE: AthleteProfile = {
  name: '',
  age: 30,
  weight: 70,
  gender: 'Male',
  restingHr: 60,
  maxHr: 190,
  runningGoal: '',
  weeklyMileage: 0,
  personalBests: '',
  isConfigured: false
};

type Tab = 'timeline' | 'plan' | 'settings';

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<AthleteProfile>(INITIAL_PROFILE);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [history, setHistory] = useState<WorkoutAnalysis[]>([]);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ themeColor: 'cyan' });
  
  // Plan Generation Preferences State
  const [planPrefs, setPlanPrefs] = useState({
    longRunDay: 'Sunday',
    workoutDay: 'Tuesday',
    notes: ''
  });
  
  // Manual Vitals State
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualSleepHours, setManualSleepHours] = useState(7.5);

  // UI State
  const [viewingWorkout, setViewingWorkout] = useState<WorkoutAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analyzing...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // File inputs refs
  const vitalsInputRef = React.useRef<HTMLInputElement>(null);
  const workoutImageInputRef = React.useRef<HTMLInputElement>(null);
  const tcxInputRef = React.useRef<HTMLInputElement>(null);
  const backupInputRef = React.useRef<HTMLInputElement>(null);

  // Load data on mount
  useEffect(() => {
    const loadedUser = loadUser();
    const loadedProfile = loadProfile();
    const loadedReadiness = loadReadiness();
    const loadedHistory = loadHistory();
    const loadedSettings = loadSettings();
    const loadedPlan = loadPlan();
    const loadedPlanPrefs = loadPlanPrefs();

    if (loadedUser) setUser(loadedUser);
    if (loadedProfile) setProfile(loadedProfile);
    if (loadedReadiness) setReadiness(loadedReadiness);
    if (loadedHistory) setHistory(loadedHistory);
    if (loadedSettings) setSettings(loadedSettings);
    if (loadedPlan) setPlan(loadedPlan);
    if (loadedPlanPrefs) setPlanPrefs(loadedPlanPrefs);
    
    setIsDataLoaded(true);
  }, []);

  // Save Plan Preferences whenever they change
  useEffect(() => {
    if (isDataLoaded) {
      savePlanPrefs(planPrefs);
    }
  }, [planPrefs, isDataLoaded]);

  // Theme Helpers
  const getThemeColorClass = (type: 'text' | 'bg' | 'border' | 'shadow' | 'from' | 'to') => {
    const color = settings.themeColor;
    if (type === 'text') return `text-${color}-400`;
    if (type === 'bg') return `bg-${color}-500`;
    if (type === 'border') return `border-${color}-500`;
    if (type === 'shadow') return `shadow-${color}-500`;
    if (type === 'from') return `from-${color}-400`;
    if (type === 'to') return `to-${color}-600`;
    return '';
  };

  // Auth & Backup Logic
  const handleGoogleLogin = () => {
    setIsLoading(true);
    setLoadingMessage("Connecting to Google...");
    
    // Simulate API delay
    setTimeout(() => {
      const mockUser: UserProfile = {
        id: 'mock-google-id-123',
        name: profile.name || 'Running Enthusiast',
        email: 'runner@gmail.com',
        avatarUrl: 'https://lh3.googleusercontent.com/a/default-user',
        isAuthenticated: true
      };
      setUser(mockUser);
      saveUser(mockUser);
      setIsLoading(false);
      setUploadError("Successfully signed in (Demo Mode)");
    }, 1500);
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      setUser(null);
      saveUser(null);
    }
  };

  const handleExportBackup = () => {
    const json = createBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `runboyrun-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const success = restoreBackup(event.target?.result as string);
        if (success) {
          alert("Backup restored successfully! The page will reload.");
          window.location.reload();
        } else {
          setUploadError("Invalid backup file format.");
        }
      } catch (err) {
        setUploadError("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Coaching Logic
  const calculateZones = (): HrZone[] => {
    const hrr = profile.maxHr - profile.restingHr;
    const calc = (pct: number) => Math.round(hrr * pct + profile.restingHr);
    return [
      { zone: 1, min: calc(0.5), max: calc(0.6), description: 'Recovery' },
      { zone: 2, min: calc(0.6), max: calc(0.7), description: 'Aerobic' },
      { zone: 3, min: calc(0.7), max: calc(0.8), description: 'Tempo' },
      { zone: 4, min: calc(0.8), max: calc(0.9), description: 'Threshold' },
      { zone: 5, min: calc(0.9), max: profile.maxHr, description: 'Anaerobic' },
    ];
  };

  // Use High-Res Buckets if available, otherwise fallback to splits
  const calculateTimeInZones = (analysis: WorkoutAnalysis) => {
    const zones = calculateZones();
    const distribution = [0, 0, 0, 0, 0];
    
    if (analysis.parsedData?.heartRateBuckets) {
       // High Res Exact Calculation
       Object.entries(analysis.parsedData.heartRateBuckets).forEach(([hrStr, seconds]) => {
          const hr = parseInt(hrStr);
          if (hr >= zones[4].min) distribution[4] += seconds;
          else if (hr >= zones[3].min) distribution[3] += seconds;
          else if (hr >= zones[2].min) distribution[2] += seconds;
          else if (hr >= zones[1].min) distribution[1] += seconds;
          else if (hr > 40) distribution[0] += seconds; // Basic filter for sensor noise
       });
    } else if (analysis.parsedData?.splits) {
       // Fallback to averages (less accurate)
       analysis.parsedData.splits.forEach(split => {
         let zoneIndex = 0;
         if (split.avgHr >= zones[4].min) zoneIndex = 4;
         else if (split.avgHr >= zones[3].min) zoneIndex = 3;
         else if (split.avgHr >= zones[2].min) zoneIndex = 2;
         else if (split.avgHr >= zones[1].min) zoneIndex = 1;
         distribution[zoneIndex] += split.timeSeconds;
       });
    }

    return distribution;
  };

  const handleProfileSave = (newProfile: AthleteProfile) => {
    setProfile(newProfile);
    saveProfile(newProfile);
  };

  const handleThemeChange = (color: AppSettings['themeColor']) => {
    const newSettings = { ...settings, themeColor: color };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handlePlanGeneration = async () => {
    if (!profile.isConfigured) {
      setUploadError("Please configure your profile settings first.");
      setActiveTab('settings');
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Building your 4-week plan...");
    try {
      const newPlan = await generateTrainingPlan(profile, planPrefs);
      setPlan(newPlan);
      savePlan(newPlan);
    } catch (e: any) {
      setUploadError(e.message || "Failed to generate plan. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePlan = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling
    if (confirm("Are you sure you want to delete your training plan?")) {
      setPlan(null);
      savePlan(null);
    }
  };

  const getPlanDate = (startDate: number, week: number, day: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (week - 1) * 7 + (day - 1));
    return date;
  };

  const isWorkoutCompleted = (date: Date): boolean => {
    return history.some(h => {
       const hDate = new Date(h.timestamp);
       return hDate.getDate() === date.getDate() && 
              hDate.getMonth() === date.getMonth() && 
              hDate.getFullYear() === date.getFullYear();
    });
  };

  const getTodaysScheduledWorkout = (): ScheduledWorkout | null => {
    if (!plan) return null;
    const now = new Date();
    // Find workout that matches today's date
    const workout = plan.schedule.find(s => {
      const date = getPlanDate(plan.startDate, s.week, s.day);
      return date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    });
    return workout || null;
  };

  // Check if readiness data is from today
  const isReadinessFresh = (): boolean => {
    if (!readiness) return false;
    const rDate = new Date(readiness.lastUpdated);
    const now = new Date();
    return rDate.getDate() === now.getDate() && 
           rDate.getMonth() === now.getMonth() && 
           rDate.getFullYear() === now.getFullYear();
  };

  // NEW: Generate recent history context for the AI
  const getRecentHistoryContext = (): string => {
    const now = Date.now();
    const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);
    // Filter workouts from last 5 days
    const recentWorkouts = history
      .filter(h => h.timestamp >= fiveDaysAgo)
      .sort((a,b) => b.timestamp - a.timestamp); // Newest first

    if (recentWorkouts.length === 0) return "No recorded workouts in the last 5 days.";

    return recentWorkouts.map(w => {
      const date = new Date(w.timestamp).toLocaleDateString();
      const dist = w.distance || 'Unknown distance';
      const pace = w.avgPace || 'Unknown pace';
      // Truncate feedback to keep context small
      const feedback = w.aiCoachFeedback ? w.aiCoachFeedback.substring(0, 100) + '...' : 'No feedback.';
      return `- [${date}] ${w.type}: ${dist} @ ${pace}. Coach said: "${feedback}"`;
    }).join('\n');
  };

  // NEW: Generate previous readiness context
  const getPreviousReadinessContext = (): string => {
    if (!readiness) return "No previous readiness data available.";
    
    const date = new Date(readiness.lastUpdated).toLocaleDateString();
    const time = new Date(readiness.lastUpdated).toLocaleTimeString();
    
    return `
      - Date/Time: ${date} at ${time}
      - Previous Score: ${readiness.score}/100
      - Previous Status: ${readiness.status}
      - Previous Summary: ${readiness.summary}
    `;
  };

  const handleManualVitalsSubmit = async () => {
    setIsLoading(true);
    setLoadingMessage("Analyzing Sleep Data...");
    setUploadError(null);
    try {
        const todaysWorkout = getTodaysScheduledWorkout();
        const workoutContext = todaysWorkout ? `${todaysWorkout.title}: ${todaysWorkout.description}` : undefined;
        const historyContext = getRecentHistoryContext();
        const previousReadinessContext = getPreviousReadinessContext();

        const result = await analyzeManualSleep(manualSleepHours, profile, workoutContext, historyContext, previousReadinessContext);
        
        const newReadiness = { ...result, lastUpdated: Date.now() };
        setReadiness(newReadiness);
        saveReadiness(newReadiness);
        setIsManualInputOpen(false); // Close the manual input view
    } catch (e: any) {
        setUploadError(e.message || "Failed to analyze manual input.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: AnalysisType) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    // Convert FileList to Array
    const files: File[] = Array.from(fileList);

    setIsLoading(true);
    setLoadingMessage(type === AnalysisType.VITALS ? 'Analyzing Biometrics...' : 'Analyzing Workout...');
    setUploadError(null);

    try {
      // Common History Context (Workouts)
      const historyContext = getRecentHistoryContext();

      if (type === AnalysisType.VITALS) {
        const todaysWorkout = getTodaysScheduledWorkout();
        const workoutContext = todaysWorkout ? `${todaysWorkout.title}: ${todaysWorkout.description}` : undefined;
        
        // Pass previous readiness data BEFORE it gets updated
        const previousReadinessContext = getPreviousReadinessContext();

        // Pass array of files
        const result = await analyzeVitals(files, profile, workoutContext, historyContext, previousReadinessContext);
        const newReadiness = { ...result, lastUpdated: Date.now() };
        setReadiness(newReadiness);
        saveReadiness(newReadiness);
        setActiveTab('timeline'); 
      } else {
        // Build Readiness Context if available for TODAY
        let readinessContext = "";
        if (readiness) {
            const readinessDate = new Date(readiness.lastUpdated);
            const today = new Date();
            const isToday = readinessDate.getDate() === today.getDate() && 
                            readinessDate.getMonth() === today.getMonth() && 
                            readinessDate.getFullYear() === today.getFullYear();
            
            if (isToday) {
                readinessContext = `
                  MORNING VITALS CONTEXT (Recorded Today):
                  - Readiness Score: ${readiness.score}/100
                  - Status: ${readiness.status}
                  - Biometric Summary: ${readiness.summary}
                  - AI Recommendation for Today was: ${readiness.recommendation}
                `;
            }
        }

        let result: any;
        if (type === AnalysisType.WORKOUT_IMAGE) {
          // Pass array of files and history context
          result = await analyzeWorkoutImage(files, profile, readinessContext, historyContext);
        } else {
          // TCX typically processes a single file at a time
          // Pass history context
          result = await analyzeTcxFile(files[0], profile, readinessContext, historyContext);
        }
        
        const newWorkout: WorkoutAnalysis = {
          id: Date.now().toString(),
          type: 'Run',
          timestamp: Date.now(),
          ...result // Spreads the full object including extendedAnalysis
        };
        const updatedHistory = [newWorkout, ...history];
        setHistory(updatedHistory);
        saveHistory(updatedHistory);
        setViewingWorkout(newWorkout); 
        setActiveTab('timeline'); // Redirect to timeline to see the result
      }
    } catch (error: any) {
      console.error(error);
      setUploadError(error.message || "Failed to analyze. Please check your API Key and try again.");
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const renderReadinessScore = (score: number) => {
    let colorClass = 'text-red-500';
    if (score >= 50) colorClass = 'text-yellow-500';
    if (score >= 80) colorClass = 'text-green-500';

    return (
      <div className="flex flex-col items-center justify-center p-4 min-w-[100px]">
         <span className={`text-7xl font-bold ${colorClass} leading-none tracking-tighter drop-shadow-lg`}>{score}</span>
      </div>
    );
  };

  // --- Render Views ---

  const renderTimelineView = () => {
    const todaysWorkout = getTodaysScheduledWorkout();
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0,0,0,0);
    const weeklyVolume = history
      .filter(h => h.timestamp >= startOfWeek.getTime())
      .reduce((sum, h) => sum + parseFloat(h.distance || '0'), 0);

    return (
      <div className="space-y-6 animate-fade-in">
         {/* 1. Readiness Upload / Display */}
         <GlassCard title="Morning Readiness" icon={<Battery className={`w-5 h-5 ${readiness ? 'text-green-400' : 'text-gray-400'}`} />}>
            {!readiness ? (
              <div className="py-2">
                {!isManualInputOpen ? (
                   <div className="text-center py-4">
                     <p className="text-white/60 text-sm mb-6">How well did you recover? Analyze your sleep/HRV data to get a daily recommendation.</p>
                     
                     <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => vitalsInputRef.current?.click()}
                          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium ${getThemeColorClass('text')}`}
                        >
                          <Upload className="w-4 h-4" /> Upload Screenshot (HRV/Sleep)
                        </button>
                        
                        <div className="flex items-center gap-2 text-white/20 text-xs justify-center">
                            <div className="h-[1px] bg-white/10 w-12"></div>
                            OR
                            <div className="h-[1px] bg-white/10 w-12"></div>
                        </div>

                        <button 
                          onClick={() => setIsManualInputOpen(true)}
                          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium text-white/70`}
                        >
                          <MousePointerClick className="w-4 h-4" /> Manual Input
                        </button>
                     </div>
                   </div>
                ) : (
                   <div className="space-y-6 animate-fade-in">
                       <div className="flex justify-between items-center mb-2">
                           <h4 className="text-sm font-bold text-white">Manual Input</h4>
                           <button onClick={() => setIsManualInputOpen(false)} className="text-xs text-white/40 hover:text-white">Cancel</button>
                       </div>
                       
                       <div className="bg-black/20 rounded-xl p-4">
                           <div className="flex justify-between items-end mb-4">
                               <label className="flex items-center gap-2 text-xs font-bold text-white/60 uppercase">
                                  <Moon className="w-3 h-3" /> Hours of Sleep
                               </label>
                               <span className="text-2xl font-bold text-white">{manualSleepHours} <span className="text-sm text-white/40">hrs</span></span>
                           </div>
                           <input 
                              type="range" 
                              min="3" 
                              max="12" 
                              step="0.5" 
                              value={manualSleepHours} 
                              onChange={(e) => setManualSleepHours(parseFloat(e.target.value))}
                              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                           />
                           <div className="flex justify-between text-[10px] text-white/20 mt-2">
                               <span>3h</span>
                               <span>6h</span>
                               <span>9h</span>
                               <span>12h</span>
                           </div>
                       </div>
                       
                       <button 
                         onClick={handleManualVitalsSubmit}
                         className={`w-full py-3 rounded-xl font-bold text-white shadow-lg shadow-${settings.themeColor}-500/20 bg-gradient-to-r from-${settings.themeColor}-500 to-${settings.themeColor}-600 hover:brightness-110 transition-all flex items-center justify-center gap-2`}
                       >
                         <Zap className="w-4 h-4 fill-current" />
                         Calculate Readiness
                       </button>
                   </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-4">
                    {renderReadinessScore(readiness.score)}
                    <div className="flex-1 pl-4 border-l border-white/10">
                      <h4 className="text-xl font-bold text-white mb-1 drop-shadow-md">{readiness.status}</h4>
                      <p className="text-xs text-white/70 leading-relaxed font-medium">{readiness.summary}</p>
                    </div>
                 </div>
                 {/* Recommendation Card Inline */}
                 <div className={`mt-2 relative overflow-hidden rounded-xl p-[1px] bg-gradient-to-r ${getThemeColorClass('from')} ${getThemeColorClass('to')} shadow-lg shadow-black/20`}>
                    <div className="bg-slate-900/90 backdrop-blur-sm rounded-[11px] p-4 relative">
                        <div className="flex items-center gap-2 mb-2">
                           <Play className={`w-4 h-4 ${getThemeColorClass('text')} fill-current`} />
                           <h3 className="text-xs font-bold uppercase tracking-wide text-white">Daily Prescription</h3>
                        </div>
                        <p className="text-white font-medium text-sm leading-relaxed">
                            {readiness.recommendation}
                        </p>
                        {todaysWorkout && (
                          <div className="mt-2 pt-2 border-t border-white/10 text-xs text-white/40 flex gap-1">
                             <Calendar className="w-3 h-3" />
                             <span>vs. Scheduled: {todaysWorkout.title}</span>
                          </div>
                        )}
                    </div>
                 </div>

                 <button 
                    onClick={() => { setReadiness(null); setIsManualInputOpen(false); }}
                    className="text-xs text-center text-white/30 hover:text-white/50 mt-1 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3 h-3"/> Update Vitals
                  </button>
              </div>
            )}
            <input type="file" ref={vitalsInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, AnalysisType.VITALS)} />
         </GlassCard>

         {/* 2. Workout Log Buttons */}
         <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => workoutImageInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all active:scale-95 shadow-lg group"
            >
              <div className={`p-3 rounded-full bg-white/5 group-hover:scale-110 transition-transform`}>
                 <ImageIcon className={`w-6 h-6 ${getThemeColorClass('text')}`} />
              </div>
              <span className="text-xs font-bold text-white/80 uppercase tracking-wide mt-2">Screenshot</span>
            </button>
            <input type="file" ref={workoutImageInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, AnalysisType.WORKOUT_IMAGE)} />

            <button 
              onClick={() => tcxInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all active:scale-95 shadow-lg group"
            >
              <div className={`p-3 rounded-full bg-white/5 group-hover:scale-110 transition-transform`}>
                 <FileCode className={`w-6 h-6 ${getThemeColorClass('text')}`} />
              </div>
              <span className="text-xs font-bold text-white/80 uppercase tracking-wide mt-2">TCX File</span>
            </button>
            <input type="file" ref={tcxInputRef} className="hidden" accept=".tcx, .xml" onChange={(e) => handleFileUpload(e, AnalysisType.WORKOUT_TCX)} />
         </div>

         {/* 3. History & Stats */}
         <GlassCard className="!p-4 bg-gradient-to-br from-white/10 to-white/5">
             <div className="flex justify-between items-end mb-4">
                 <div>
                    <h3 className="text-xs font-bold uppercase text-white/40 mb-1">Weekly Volume</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white drop-shadow-md">{weeklyVolume.toFixed(1)}</span>
                      <span className="text-sm text-white/50">km</span>
                    </div>
                 </div>
                 <div>
                    <h3 className="text-xs font-bold uppercase text-white/40 mb-1 text-right">Activities</h3>
                    <div className="text-2xl font-bold text-white text-right drop-shadow-md">{history.length}</div>
                 </div>
             </div>
             
             <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-white/30 mb-2">Recent Activities</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-white/20 italic">No workouts analyzed yet.</p>
                ) : (
                  history.slice(0, 3).map(workout => (
                    <div key={workout.id} onClick={() => { setViewingWorkout(workout); window.scrollTo(0,0); }} className="group cursor-pointer flex items-center justify-between p-3 rounded-xl bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10 transition-all">
                       <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${getThemeColorClass('bg')} bg-opacity-20`}>
                             <Activity className={`w-4 h-4 ${getThemeColorClass('text')}`} />
                          </div>
                          <div>
                             <div className="text-sm font-medium text-white">{workout.type}</div>
                             <div className="text-xs text-white/50">{new Date(workout.timestamp).toLocaleDateString()}</div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="text-sm font-bold text-white">{workout.distance || '-'}</div>
                          <div className="text-xs text-white/40">{workout.avgPace || '-'}</div>
                       </div>
                    </div>
                  ))
                )}
             </div>
         </GlassCard>
      </div>
    );
  };
  
  const renderPlanView = () => {
    return (
      <div className="space-y-6 animate-fade-in">
        <GlassCard title="Training Plan" icon={<Calendar className={`w-5 h-5 ${getThemeColorClass('text')}`} />}>
          {!plan ? (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Configure your weekly preferences and let the AI build a personalized 4-week block for you.
              </p>
              
              <div className="space-y-3">
                 <div>
                    <label className="text-xs uppercase text-white/40 font-bold mb-1 block">Long Run Day</label>
                    <select 
                      value={planPrefs.longRunDay} 
                      onChange={(e) => setPlanPrefs({...planPrefs, longRunDay: e.target.value})}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    >
                      {['Saturday', 'Sunday', 'Monday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-xs uppercase text-white/40 font-bold mb-1 block">Workout Day</label>
                    <select 
                      value={planPrefs.workoutDay} 
                      onChange={(e) => setPlanPrefs({...planPrefs, workoutDay: e.target.value})}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    >
                      {['Tuesday', 'Wednesday', 'Thursday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-xs uppercase text-white/40 font-bold mb-1 block">Focus / Notes</label>
                    <textarea 
                      value={planPrefs.notes}
                      onChange={(e) => setPlanPrefs({...planPrefs, notes: e.target.value})}
                      placeholder="e.g. Preparing for a hilly 10k"
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-20 resize-none"
                    />
                 </div>
              </div>

              <button 
                onClick={handlePlanGeneration}
                className={`w-full py-3 rounded-xl font-bold text-white shadow-lg shadow-${settings.themeColor}-500/20 bg-gradient-to-r from-${settings.themeColor}-500 to-${settings.themeColor}-600 hover:brightness-110 transition-all flex items-center justify-center gap-2`}
              >
                <Zap className="w-4 h-4 fill-current" />
                Generate AI Plan
              </button>
            </div>
          ) : (
            <div className="space-y-6">
               <div>
                  <div className="flex justify-between items-start mb-2">
                     <div>
                        <h3 className="text-lg font-bold text-white">{plan.goal}</h3>
                        <p className="text-xs text-white/50">{plan.durationWeeks} Week Block</p>
                     </div>
                     <button 
                        type="button"
                        onClick={handleDeletePlan} 
                        className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-red-400 transition-colors"
                     >
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="h-1 bg-white/10 rounded-full w-full overflow-hidden">
                     <div className={`h-full bg-${settings.themeColor}-500 w-[10%]`}></div>
                  </div>
               </div>

               <div className="space-y-4">
                  {plan.schedule.map((workout, idx) => {
                     const workoutDate = getPlanDate(plan.startDate, workout.week, workout.day);
                     // Find if there is a completed run on this date
                     const completedRun = history.find(h => {
                         const hDate = new Date(h.timestamp);
                         return hDate.getDate() === workoutDate.getDate() && 
                                hDate.getMonth() === workoutDate.getMonth() && 
                                hDate.getFullYear() === workoutDate.getFullYear();
                     });

                     const isPast = workoutDate < new Date() && !completedRun;
                     const isToday = new Date().toDateString() === workoutDate.toDateString();

                     return (
                        <div key={idx} className="flex gap-4 group">
                           <div className="flex flex-col items-center">
                              <div className={`w-2 h-2 rounded-full mt-2 transition-colors ${completedRun ? 'bg-green-500' : (isPast ? 'bg-red-500/50' : 'bg-white/20')}`}></div>
                              <div className={`w-[1px] flex-1 my-1 ${completedRun ? 'bg-green-500/50' : 'bg-white/10'}`}></div>
                           </div>
                           <div className="pb-6 flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <div className="text-[10px] font-bold uppercase text-white/30">
                                   Week {workout.week} • {workoutDate.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}
                                </div>
                                {completedRun && <span className="text-[10px] font-bold text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full border border-green-500/20">Completed</span>}
                                {isPast && !completedRun && <span className="text-[10px] font-bold text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full border border-red-500/20">Missed</span>}
                              </div>
                              
                              <div className={`rounded-xl p-4 transition-colors border ${completedRun ? 'bg-green-500/5 border-green-500/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <div className="flex justify-between items-start mb-2">
                                    <h4 className={`font-bold text-sm ${completedRun ? 'text-green-100' : 'text-white'}`}>{workout.title}</h4>
                                    <span className={`text-[10px] px-2 py-1 rounded-full ${completedRun ? 'bg-green-500/20 text-green-300' : `bg-${settings.themeColor}-500/10 text-${settings.themeColor}-400 border border-${settings.themeColor}-500/20`}`}>{workout.type}</span>
                                 </div>
                                 <p className="text-xs text-white/60 leading-relaxed mb-2">{workout.description}</p>
                                 
                                 {/* Planned Stats */}
                                 {workout.distanceKm && !completedRun && (
                                    <div className="text-xs font-mono text-white/40">{workout.distanceKm}km Target</div>
                                 )}

                                 {/* ACTUAL RUN DATA ATTACHMENT */}
                                 {completedRun && (
                                    <div className="mt-3 pt-3 border-t border-green-500/20">
                                       <div className="flex items-center gap-2 mb-2">
                                          <CheckCircle className="w-3 h-3 text-green-400" />
                                          <span className="text-xs font-bold uppercase text-green-400">Workout Log</span>
                                       </div>
                                       
                                       <div className="grid grid-cols-3 gap-2 mb-2">
                                          <div className="bg-black/20 rounded-lg p-2 text-center">
                                             <div className="text-[10px] text-white/40 uppercase">Dist</div>
                                             <div className="text-sm font-bold text-white">{completedRun.distance || '-'}</div>
                                          </div>
                                          <div className="bg-black/20 rounded-lg p-2 text-center">
                                             <div className="text-[10px] text-white/40 uppercase">Pace</div>
                                             <div className="text-sm font-bold text-white">{completedRun.avgPace || '-'}</div>
                                          </div>
                                          <div className="bg-black/20 rounded-lg p-2 text-center">
                                             <div className="text-[10px] text-white/40 uppercase">Quality</div>
                                             <div className={`text-sm font-bold ${completedRun.extendedAnalysis?.qualityScore > 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {completedRun.extendedAnalysis?.qualityScore || '-'}%
                                             </div>
                                          </div>
                                       </div>

                                       {completedRun.extendedAnalysis?.summary && (
                                           <div className="relative pl-3 border-l-2 border-green-500/30 py-1">
                                              <p className="text-xs text-green-100/70 italic leading-snug">
                                                "{completedRun.extendedAnalysis.summary}"
                                              </p>
                                           </div>
                                       )}
                                       
                                       <button 
                                          onClick={() => { setViewingWorkout(completedRun); window.scrollTo(0,0); }}
                                          className="mt-2 w-full text-center text-[10px] uppercase font-bold text-green-400/60 hover:text-green-400 transition-colors"
                                       >
                                          View Full Analysis
                                       </button>
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>
          )}
        </GlassCard>
      </div>
    );
  };

  const renderSettingsView = () => {
    return (
      <div className="space-y-6 animate-fade-in">
         {/* User Account */}
         <GlassCard title="Account" icon={<User className="w-5 h-5 text-blue-400" />}>
             {user ? (
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     {user.avatarUrl ? (
                       <img src={user.avatarUrl} alt="User" className="w-10 h-10 rounded-full ring-2 ring-white/10" />
                     ) : (
                       <div className={`w-10 h-10 rounded-full bg-${settings.themeColor}-500 flex items-center justify-center font-bold`}>{user.name[0]}</div>
                     )}
                     <div>
                       <div className="text-sm font-bold text-white">{user.name}</div>
                       <div className="text-xs text-white/50">{user.email}</div>
                     </div>
                  </div>
                  <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors">
                    <LogOut className="w-4 h-4" />
                  </button>
               </div>
             ) : (
               <button 
                 onClick={handleGoogleLogin}
                 className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
               >
                 Sign in with Google
               </button>
             )}
         </GlassCard>

         {/* Athlete Profile Form */}
         <ProfileComponent profile={profile} onSave={handleProfileSave} />

         {/* Appearance */}
         <GlassCard title="Appearance" icon={<Droplets className="w-5 h-5 text-purple-400" />}>
            <div className="flex justify-between gap-2">
               {['cyan', 'purple', 'orange', 'green'].map((color) => (
                  <button
                    key={color}
                    onClick={() => handleThemeChange(color as any)}
                    className={`h-10 flex-1 rounded-lg border-2 transition-all ${settings.themeColor === color ? 'border-white scale-105' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  >
                    <div className={`w-full h-full rounded-md ${color === 'cyan' ? 'bg-cyan-500' : color === 'purple' ? 'bg-purple-500' : color === 'orange' ? 'bg-orange-500' : 'bg-green-500'}`} />
                  </button>
               ))}
            </div>
         </GlassCard>

         {/* Data Management */}
         <GlassCard title="Data & Backup" icon={<Cloud className="w-5 h-5 text-white/50" />}>
            <div className="grid grid-cols-2 gap-3">
               <button 
                 onClick={handleExportBackup}
                 className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
               >
                 <Download className="w-5 h-5 text-white/70" />
                 <span className="text-xs font-medium text-white/60">Export Data</span>
               </button>
               
               <button 
                 onClick={() => backupInputRef.current?.click()}
                 className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
               >
                 <Upload className="w-5 h-5 text-white/70" />
                 <span className="text-xs font-medium text-white/60">Import Backup</span>
               </button>
               <input type="file" ref={backupInputRef} className="hidden" accept=".json" onChange={handleImportBackup} />
            </div>
         </GlassCard>
      </div>
    );
  };

  // Helper to draw Simple SVG Chart
  const SimpleChart = ({ data, type, height = 100, color = "#22d3ee" }: { data: DataPoint[], type: 'ele' | 'hr', height?: number, color?: string }) => {
     if (!data || data.length === 0) return null;
     
     const width = 300;
     const maxDist = data[data.length - 1].dist;
     
     // Y-Axis scaling
     let minVal = Infinity;
     let maxVal = -Infinity;
     
     data.forEach(d => {
       const val = type === 'ele' ? d.ele : d.hr;
       if (val < minVal) minVal = val;
       if (val > maxVal) maxVal = val;
     });
     
     // Add padding
     const range = maxVal - minVal;
     minVal = Math.max(0, minVal - range * 0.1);
     maxVal = maxVal + range * 0.1;
     
     const points = data.map((d, i) => {
        const x = (d.dist / maxDist) * width;
        const val = type === 'ele' ? d.ele : d.hr;
        const y = height - ((val - minVal) / (maxVal - minVal)) * height;
        return `${x},${y}`;
     }).join(' ');

     return (
        <div className="relative w-full h-full">
           <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
              {type === 'ele' ? (
                 <>
                   <defs>
                      <linearGradient id="eleGradient" x1="0" x2="0" y1="0" y2="1">
                         <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                         <stop offset="100%" stopColor={color} stopOpacity="0" />
                      </linearGradient>
                   </defs>
                   <path d={`M0,${height} ${points} L${width},${height} Z`} fill="url(#eleGradient)" />
                   <path d={`M0,${height} ${points}`} fill="none" stroke={color} strokeWidth="1.5" />
                 </>
              ) : (
                 <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
           </svg>
           {/* Axis Labels */}
           <div className="absolute bottom-0 right-0 text-[10px] text-white/30">{Math.round(maxDist/1000)}km</div>
           <div className="absolute top-0 left-0 text-[10px] text-white/30">{Math.round(maxVal)}{type==='ele'?'m':'bpm'}</div>
           <div className="absolute bottom-0 left-0 text-[10px] text-white/30">{Math.round(minVal)}{type==='ele'?'m':'bpm'}</div>
        </div>
     );
  };

  const renderWorkoutDetail = () => {
    if (!viewingWorkout) return null;

    const zones = calculateZones();
    const parsed = viewingWorkout.parsedData;
    const deepAnalysis = viewingWorkout.extendedAnalysis;
    
    // Safety check for zone chart
    let zoneSeconds: number[] = [0,0,0,0,0];
    if (parsed) {
      zoneSeconds = calculateTimeInZones(viewingWorkout);
    }
    const totalSeconds = zoneSeconds.reduce((a,b) => a+b, 0) || 1;

    return (
      <div className="fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto animate-fade-in">
         {/* Noise overlay also for detailed view */}
         <div className="fixed inset-0 z-[-1] bg-noise pointer-events-none opacity-20"></div>

         {/* Header */}
         <div className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/10 p-4 flex items-center gap-4">
            <button onClick={() => setViewingWorkout(null)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
               <ChevronRight className="w-6 h-6 rotate-180 text-white" />
            </button>
            <div className="flex-1">
               <h2 className="text-lg font-bold text-white leading-tight">{deepAnalysis?.title || 'Workout Analysis'}</h2>
               <p className="text-xs text-white/50">{new Date(viewingWorkout.timestamp).toDateString()}</p>
            </div>
         </div>

         <div className="p-4 space-y-6 max-w-2xl mx-auto pb-20">
            
            {/* 1. HERO METRICS GRID */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <GlassCard className="!p-4 bg-white/5 flex flex-col items-center justify-center gap-1">
                  <span className="text-xs uppercase text-white/40">Distance</span>
                  <span className={`text-2xl font-bold ${getThemeColorClass('text')}`}>{viewingWorkout.distance || '-'}</span>
               </GlassCard>
               <GlassCard className="!p-4 bg-white/5 flex flex-col items-center justify-center gap-1">
                   <span className="text-xs uppercase text-white/40">Pace</span>
                   <span className="text-2xl font-bold text-white">{viewingWorkout.avgPace || '-'}</span>
               </GlassCard>
               <GlassCard className="!p-4 bg-white/5 flex flex-col items-center justify-center gap-1">
                   <span className="text-xs uppercase text-white/40">Avg HR</span>
                   <span className="text-xl font-bold text-red-400">{viewingWorkout.avgHr ? `${viewingWorkout.avgHr} bpm` : '-'}</span>
               </GlassCard>
               <GlassCard className="!p-4 bg-white/5 flex flex-col items-center justify-center gap-1">
                   <span className="text-xs uppercase text-white/40">Cadence</span>
                   <span className="text-xl font-bold text-purple-400">{viewingWorkout.avgCadence ? `${viewingWorkout.avgCadence}` : '-'}</span>
               </GlassCard>
            </div>

            {/* 2. PERFORMANCE CHARTS (ELEVATION & HR) */}
            {parsed && parsed.seriesSample.length > 0 && (
                <GlassCard title="Performance Charts" icon={<BarChart2 className="w-5 h-5 text-cyan-400"/>}>
                    <div className="space-y-6">
                        {/* Elevation Chart */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Mountain className="w-3 h-3 text-white/40" />
                                <span className="text-xs uppercase text-white/40 font-bold">Elevation Profile</span>
                            </div>
                            <div className="h-24 w-full">
                                <SimpleChart data={parsed.seriesSample} type="ele" color="#94a3b8" />
                            </div>
                        </div>
                        
                        {/* HR Chart */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Activity className="w-3 h-3 text-red-400/60" />
                                <span className="text-xs uppercase text-white/40 font-bold">Heart Rate</span>
                            </div>
                            <div className="h-24 w-full">
                                <SimpleChart data={parsed.seriesSample} type="hr" color="#ef4444" />
                            </div>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* 3. ZONE DISTRIBUTION */}
            {parsed && (
                 <GlassCard title="Heart Rate Zones" icon={<Activity className="w-4 h-4 text-red-500" />}>
                     <div className="space-y-3 mt-1">
                        {zones.map((zone, idx) => {
                           const seconds = zoneSeconds[idx] || 0;
                           const pct = (seconds / totalSeconds) * 100;
                           const colors = ['bg-gray-400', 'bg-blue-400', 'bg-green-500', 'bg-orange-500', 'bg-red-600'];
                           const textColors = ['text-gray-400', 'text-blue-400', 'text-green-500', 'text-orange-500', 'text-red-500'];
                           
                           return (
                              <div key={idx} className="flex flex-col gap-1">
                                 <div className="flex justify-between items-end text-xs">
                                     <span className={`font-bold ${textColors[idx]}`}>Zone {zone.zone} <span className="text-white/30 font-normal ml-1">({zone.min}-{zone.max} bpm)</span></span>
                                     <div className="flex gap-2">
                                         <span className="text-white font-mono">{formatDuration(seconds)}</span>
                                         <span className="text-white/40 w-8 text-right">{Math.round(pct)}%</span>
                                     </div>
                                 </div>
                                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full ${colors[idx]} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                                 </div>
                              </div>
                           )
                        })}
                     </div>
                 </GlassCard>
            )}

            {/* 4. DEEP ANALYSIS DASHBOARD */}
            {deepAnalysis && (
               <GlassCard className="bg-gradient-to-b from-white/10 to-transparent">
                  <div className="flex items-center gap-2 mb-6">
                     <BrainCircuit className="w-5 h-5 text-cyan-400" />
                     <h3 className="text-lg font-bold text-white uppercase tracking-wide">Deep Dive</h3>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                      <div>
                          <div className="flex justify-between items-center mb-1">
                             <span className="text-xs font-bold text-white/60 uppercase">Quality</span>
                             <span className="text-xs font-bold text-green-400">{deepAnalysis.qualityScore}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400" style={{width: `${deepAnalysis.qualityScore}%`}}></div>
                          </div>
                      </div>
                      <div>
                          <div className="flex justify-between items-center mb-1">
                             <span className="text-xs font-bold text-white/60 uppercase">RPE (Effort)</span>
                             <span className="text-xs font-bold text-yellow-400">{deepAnalysis.effortScore}/10</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-yellow-500 to-red-500" style={{width: `${deepAnalysis.effortScore * 10}%`}}></div>
                          </div>
                      </div>
                  </div>

                  {/* Summary Text */}
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 mb-6 relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                     <p className="text-sm text-white/90 italic leading-relaxed">"{deepAnalysis.summary}"</p>
                  </div>

                  {/* Physiological Impact */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg"><Droplets className="w-4 h-4 text-blue-400" /></div>
                        <div>
                           <div className="text-[10px] uppercase text-white/40">Fluid Loss</div>
                           <div className="text-sm font-bold text-white">~{deepAnalysis.hydrationEstimateMl}ml</div>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><Battery className="w-4 h-4 text-purple-400" /></div>
                        <div>
                           <div className="text-[10px] uppercase text-white/40">Full Recovery</div>
                           <div className="text-sm font-bold text-white">{deepAnalysis.recoveryTimeHours} Hours</div>
                        </div>
                     </div>
                  </div>

                  {/* Form & Pacing Analysis */}
                  <div className="space-y-4">
                     <div className="p-3 bg-black/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-1">
                           <Footprints className="w-4 h-4 text-white/50" />
                           <span className="text-xs font-bold text-white">Form & Efficiency</span>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed">{deepAnalysis.formAnalysis}</p>
                     </div>
                     <div className="p-3 bg-black/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-1">
                           <Gauge className="w-4 h-4 text-white/50" />
                           <span className="text-xs font-bold text-white">Pacing Strategy</span>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed">{deepAnalysis.pacingAnalysis}</p>
                     </div>
                  </div>
               </GlassCard>
            )}

            {/* 5. STRENGTHS & WEAKNESSES */}
            {deepAnalysis && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-3xl bg-green-500/5 border border-green-500/10">
                     <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-green-400 mb-3">
                        <ArrowUpRight className="w-4 h-4" /> Key Strengths
                     </h4>
                     <ul className="space-y-2">
                        {deepAnalysis.keyStrengths.map((s, i) => (
                           <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                              <span className="mt-1 w-1 h-1 rounded-full bg-green-500" />
                              {s}
                           </li>
                        ))}
                     </ul>
                  </div>
                  <div className="p-4 rounded-3xl bg-red-500/5 border border-red-500/10">
                     <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-red-400 mb-3">
                        <ArrowDownRight className="w-4 h-4" /> Focus Areas
                     </h4>
                     <ul className="space-y-2">
                        {deepAnalysis.areasForImprovement.map((s, i) => (
                           <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                              <span className="mt-1 w-1 h-1 rounded-full bg-red-500" />
                              {s}
                           </li>
                        ))}
                     </ul>
                  </div>
               </div>
            )}

            {/* 6. COACH'S PLAN */}
            <GlassCard title="Coach's Analysis" icon={<Zap className="w-5 h-5 text-yellow-400" />}>
               <p className="text-sm text-white/80 leading-relaxed mb-4">{viewingWorkout.aiCoachFeedback}</p>
               <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                     <TrendingUp className={`w-4 h-4 ${getThemeColorClass('text')}`} />
                     <span className="text-xs font-bold uppercase text-white">Next Step</span>
                  </div>
                  <p className="text-sm text-white/60">{viewingWorkout.nextWorkoutSuggestion}</p>
               </div>
            </GlassCard>
            
            {/* 7. SPLITS & BEST EFFORTS */}
            {parsed && (
              <>
                 {parsed.bestEfforts && parsed.bestEfforts.length > 0 && (
                    <GlassCard title="Best Efforts" icon={<Medal className="w-4 h-4 text-yellow-500" />}>
                        <div className="grid grid-cols-3 gap-2">
                           {parsed.bestEfforts.map(effort => (
                              <div key={effort.distanceLabel} className="text-center p-2 rounded-lg bg-white/5">
                                 <div className="text-xs text-white/40 uppercase">{effort.distanceLabel}</div>
                                 <div className="text-lg font-bold text-white">{formatDuration(effort.timeSeconds)}</div>
                                 <div className="text-[10px] text-white/30">{formatPace(effort.paceSeconds)}</div>
                              </div>
                           ))}
                        </div>
                    </GlassCard>
                 )}

                 <GlassCard title="Splits" icon={<List className="w-4 h-4 text-white/50" />}>
                    <div className="space-y-1">
                       {parsed.splits.map(split => (
                          <div key={split.kilometer} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                             <div className="text-sm text-white/60 w-8">{split.kilometer}</div>
                             <div className="text-sm font-mono text-white flex-1 text-center">{formatDuration(split.timeSeconds)}</div>
                             <div className="flex flex-col items-end w-20">
                                <span className="text-xs text-red-400/80">{split.avgHr > 0 ? `${split.avgHr} bpm` : ''}</span>
                                {split.avgCadence && split.avgCadence > 0 && <span className="text-[10px] text-purple-400/80">{split.avgCadence} spm</span>}
                             </div>
                          </div>
                       ))}
                    </div>
                 </GlassCard>
              </>
            )}
            
            <button 
              onClick={() => {
                if (confirm('Delete this workout log?')) {
                  const newHistory = history.filter(h => h.id !== viewingWorkout.id);
                  setHistory(newHistory);
                  saveHistory(newHistory);
                  setViewingWorkout(null);
                }
              }}
              className="w-full py-4 text-center text-red-500 text-sm hover:bg-red-500/10 rounded-xl transition-colors"
            >
              Delete Log
            </button>
         </div>
      </div>
    );
  }

  // Loading Overlay
  if (!isDataLoaded) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>;

  return (
    <div className={`min-h-screen font-sans bg-[#0f172a] text-white relative selection:${getThemeColorClass('bg')} selection:text-white overflow-hidden`}>
      {/* Noise Texture Overlay */}
      <div className="fixed inset-0 z-0 bg-noise opacity-20 pointer-events-none"></div>

      {/* Background Blobs - Liquid Effect */}
      <div className={`fixed top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-${settings.themeColor}-600/20 blur-[120px] animate-blob mix-blend-screen`} />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/15 blur-[100px] animate-blob-slow mix-blend-screen" />
      <div className="fixed top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-[80px] animate-blob animation-delay-4000 mix-blend-screen" />

      {/* Main Content */}
      <main className="relative z-10 max-w-md mx-auto min-h-screen pb-24 flex flex-col">
         {/* Header */}
         <div className="p-6 pb-2 flex justify-between items-center z-20">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg">Run Boy Run</h1>
              <p className="text-xs text-white/50 uppercase tracking-widest font-semibold">AI Coach</p>
            </div>
            {user && user.isAuthenticated ? (
               <div className={`w-8 h-8 rounded-full bg-gradient-to-tr from-${settings.themeColor}-400 to-${settings.themeColor}-600 flex items-center justify-center text-white font-bold text-xs shadow-lg ring-2 ring-white/10`}>
                  {user.name.charAt(0)}
               </div>
            ) : (
               <div className={`w-2 h-2 rounded-full ${getThemeColorClass('bg')} shadow-[0_0_15px_rgba(34,211,238,0.8)]`} />
            )}
         </div>

         {/* Content Area */}
         <div className="flex-1 p-4 z-20">
             {activeTab === 'timeline' && renderTimelineView()}
             {activeTab === 'plan' && renderPlanView()}
             {activeTab === 'settings' && renderSettingsView()}
         </div>

         {/* Navigation Bar */}
         <div className="fixed bottom-0 left-0 w-full z-40 bg-[#0f172a]/60 backdrop-blur-3xl border-t border-white/5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div className="max-w-md mx-auto grid grid-cols-3 h-20 items-center justify-items-center">
               <button onClick={() => setActiveTab('timeline')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'timeline' ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-white/40 hover:text-white/60'}`}>
                  <Activity className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Coach</span>
               </button>
               <button onClick={() => setActiveTab('plan')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'plan' ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-white/40 hover:text-white/60'}`}>
                  <Calendar className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Plan</span>
               </button>
               <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'settings' ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-white/40 hover:text-white/60'}`}>
                  <Settings className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Settings</span>
               </button>
            </div>
         </div>
      </main>

      {/* Overlays */}
      {viewingWorkout && renderWorkoutDetail()}
      
      {isLoading && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
           <Loader2 className={`w-12 h-12 ${getThemeColorClass('text')} animate-spin mb-4`} />
           <h3 className="text-xl font-bold text-white mb-2">{loadingMessage}</h3>
           <p className="text-sm text-white/50">Analyzing data points & generating insights...</p>
        </div>
      )}

      {uploadError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-sm bg-red-500/10 border border-red-500/50 backdrop-blur-xl p-4 rounded-2xl flex items-start gap-3 shadow-2xl">
           <div className="p-1 bg-red-500 rounded-full mt-0.5"><X className="w-3 h-3 text-white" /></div>
           <div className="flex-1">
             <h4 className="text-sm font-bold text-white mb-1">Notice</h4>
             <p className="text-xs text-white/80 leading-relaxed">{uploadError}</p>
           </div>
           <button onClick={() => setUploadError(null)} className="text-white/40 hover:text-white">
             <X className="w-4 h-4" />
           </button>
        </div>
      )}
    </div>
  );
};

export default App;
