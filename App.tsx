import React, { useState, useEffect } from 'react';
import { AthleteProfile, ReadinessData, WorkoutAnalysis, AnalysisType, HrZone, AppSettings, TrainingPlan, ScheduledWorkout, UserProfile } from './types';
import { analyzeVitals, analyzeWorkoutImage, analyzeTcxFile, generateTrainingPlan } from './services/geminiService';
import { formatDuration, formatPace } from './services/tcxParser';
import { saveProfile, loadProfile, saveReadiness, loadReadiness, saveHistory, loadHistory, saveSettings, loadSettings, savePlan, loadPlan, savePlanPrefs, loadPlanPrefs, saveUser, loadUser, createBackup, restoreBackup } from './services/storage';
import { GlassCard } from './components/GlassCard';
import { AthleteProfile as ProfileComponent } from './components/AthleteProfile';
import { Activity, Battery, Upload, Zap, ChevronRight, FileCode, ImageIcon, Loader2, TrendingUp, Mountain, History, Calendar, MapPin, Play, Settings, List, X, BarChart, Medal, Flame, Trash2, PlusCircle, CheckCircle, Clock, Cloud, Download, LogOut, ShieldAlert, AlertTriangle, Droplets, Gauge, BrainCircuit, Footprints, ArrowUpRight, ArrowDownRight, Wind, User } from 'lucide-react';

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

  const calculateTimeInZones = (splits: { avgHr: number, timeSeconds: number }[]) => {
    const zones = calculateZones();
    const distribution = [0, 0, 0, 0, 0];
    splits.forEach(split => {
      let zoneIndex = 0;
      if (split.avgHr >= zones[4].min) zoneIndex = 4;
      else if (split.avgHr >= zones[3].min) zoneIndex = 3;
      else if (split.avgHr >= zones[2].min) zoneIndex = 2;
      else if (split.avgHr >= zones[1].min) zoneIndex = 1;
      distribution[zoneIndex] += split.timeSeconds;
    });
    const total = distribution.reduce((a, b) => a + b, 0);
    return distribution.map(d => total > 0 ? (d / total) * 100 : 0);
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

  const handleDeletePlan = () => {
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
         <span className={`text-7xl font-bold ${colorClass} leading-none tracking-tighter`}>{score}</span>
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
              <div className="text-center py-6">
                <p className="text-white/40 text-sm mb-4">Upload HRV/Sleep screenshot to see if you're ready for {todaysWorkout ? 'your scheduled ' + todaysWorkout.title : 'today\'s training'}.</p>
                <button 
                  onClick={() => vitalsInputRef.current?.click()}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium ${getThemeColorClass('text')}`}
                >
                  <Upload className="w-4 h-4" /> Upload Vitals
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                 <div className="flex items-center gap-4">
                    {renderReadinessScore(readiness.score)}
                    <div className="flex-1 pl-4 border-l border-white/10">
                      <h4 className="text-xl font-bold text-white mb-1">{readiness.status}</h4>
                      <p className="text-xs text-white/60 leading-relaxed">{readiness.summary}</p>
                    </div>
                 </div>
                 {/* Recommendation Card Inline */}
                 <div className={`mt-2 relative overflow-hidden rounded-xl p-[1px] bg-gradient-to-r ${getThemeColorClass('from')} ${getThemeColorClass('to')} shadow-lg shadow-black/20`}>
                    <div className="bg-slate-900 rounded-[11px] p-4 relative">
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
                    onClick={() => vitalsInputRef.current?.click()}
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
              className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-95"
            >
              <ImageIcon className={`w-5 h-5 ${getThemeColorClass('text')}`} />
              <span className="text-xs font-medium text-white/70">Analyze Screenshot</span>
            </button>
            <input type="file" ref={workoutImageInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, AnalysisType.WORKOUT_IMAGE)} />

            <button 
              onClick={() => tcxInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-95"
            >
              <FileCode className={`w-5 h-5 ${getThemeColorClass('text')}`} />
              <span className="text-xs font-medium text-white/70">Analyze TCX</span>
            </button>
            <input type="file" ref={tcxInputRef} className="hidden" accept=".tcx, .xml" onChange={(e) => handleFileUpload(e, AnalysisType.WORKOUT_TCX)} />
         </div>

         {/* 3. History & Stats */}
         <GlassCard className="!p-4 bg-gradient-to-br from-white/10 to-white/5">
             <div className="flex justify-between items-end mb-4">
                 <div>
                    <h3 className="text-xs font-bold uppercase text-white/40 mb-1">Weekly Volume</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white">{weeklyVolume.toFixed(1)}</span>
                      <span className="text-sm text-white/50">km</span>
                    </div>
                 </div>
                 <div>
                    <h3 className="text-xs font-bold uppercase text-white/40 mb-1 text-right">Activities</h3>
                    <div className="text-2xl font-bold text-white text-right">{history.length}</div>
                 </div>
             </div>
             
             <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-white/30 mb-2">Recent Activities</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-white/20 italic">No workouts analyzed yet.</p>
                ) : (
                  history.slice(0, 3).map(workout => (
                    <div key={workout.id} onClick={() => { setViewingWorkout(workout); window.scrollTo(0,0); }} className="group cursor-pointer flex items-center justify-between p-3 rounded-xl bg-white/5 border border-transparent hover:border-white/20 transition-all">
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
                     <button onClick={handleDeletePlan} className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-red-400 transition-colors">
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
                     return (
                        <div key={idx} className="flex gap-4 group">
                           <div className="flex flex-col items-center">
                              <div className={`w-2 h-2 rounded-full mt-2 bg-white/20 group-hover:bg-white/40`}></div>
                              <div className="w-[1px] bg-white/10 flex-1 my-1"></div>
                           </div>
                           <div className="pb-6 flex-1">
                              <div className="text-[10px] font-bold uppercase text-white/30 mb-1">Week {workout.week} • Day {workout.day}</div>
                              <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                 <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-white text-sm">{workout.title}</h4>
                                    <span className={`text-[10px] px-2 py-1 rounded-full bg-${settings.themeColor}-500/10 text-${settings.themeColor}-400 border border-${settings.themeColor}-500/20`}>{workout.type}</span>
                                 </div>
                                 <p className="text-xs text-white/60 leading-relaxed">{workout.description}</p>
                                 {workout.distanceKm && (
                                    <div className="mt-2 text-xs font-mono text-white/40">{workout.distanceKm}km Target</div>
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

  const renderWorkoutDetail = () => {
    if (!viewingWorkout) return null;

    const zones = calculateZones();
    const parsed = viewingWorkout.parsedData;
    const deepAnalysis = viewingWorkout.extendedAnalysis;
    
    // Safety check for zone chart
    let zoneDist: number[] = [];
    if (parsed && parsed.splits) {
      zoneDist = calculateTimeInZones(parsed.splits);
    }

    return (
      <div className="fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto animate-fade-in">
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
            
            {/* 1. HERO METRICS GRID (Improved for deeper data) */}
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
            
            {/* Secondary Metrics Row */}
            <div className="grid grid-cols-3 gap-3">
               <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center border border-white/5">
                  <Mountain className="w-4 h-4 text-white/40 mb-1" />
                  <span className="text-xs text-white/40">Gain</span>
                  <span className="text-sm font-bold text-white">{viewingWorkout.elevationGain ? `${Math.round(viewingWorkout.elevationGain)}m` : '-'}</span>
               </div>
               <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center border border-white/5">
                  <Flame className="w-4 h-4 text-orange-400/70 mb-1" />
                  <span className="text-xs text-white/40">Cals</span>
                  <span className="text-sm font-bold text-white">{viewingWorkout.calories ? viewingWorkout.calories : '-'}</span>
               </div>
               <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center border border-white/5">
                  <Clock className="w-4 h-4 text-blue-400/70 mb-1" />
                  <span className="text-xs text-white/40">Time</span>
                  <span className="text-sm font-bold text-white">{viewingWorkout.duration || '-'}</span>
               </div>
            </div>

            {/* 2. DEEP ANALYSIS DASHBOARD */}
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

            {/* 3. Strengths & Weaknesses */}
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

            {/* 4. COACH'S PLAN */}
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
            
            {/* 5. DATA CHARTS (Only if TCX available) */}
            {parsed && (
              <>
                 {/* Zone Distribution */}
                 <GlassCard title="Zone Distribution">
                    <div className="space-y-2 mt-2">
                       {zones.map((zone, idx) => {
                          const pct = zoneDist[idx] || 0;
                          if (pct === 0) return null;
                          return (
                             <div key={idx} className="flex items-center gap-2 text-xs">
                                <div className="w-8 text-white/50">Z{zone.zone}</div>
                                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                   <div className={`h-full ${['bg-gray-400', 'bg-blue-400', 'bg-green-400', 'bg-orange-400', 'bg-red-500'][idx]}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <div className="w-8 text-right text-white/80">{Math.round(pct)}%</div>
                             </div>
                          )
                       })}
                    </div>
                 </GlassCard>

                 {/* Best Efforts */}
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

                 {/* Splits */}
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
    <div className={`min-h-screen font-sans bg-[#0f172a] text-white relative selection:${getThemeColorClass('bg')} selection:text-white`}>
      {/* Background Blobs */}
      <div className={`fixed top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-${settings.themeColor}-600/20 blur-[100px] animate-blob`} />
      <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[80px] animate-blob animation-delay-2000" />

      {/* Main Content */}
      <main className="relative z-10 max-w-md mx-auto min-h-screen pb-24 flex flex-col">
         {/* Header */}
         <div className="p-6 pb-2 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Run Boy Run</h1>
              <p className="text-xs text-white/50 uppercase tracking-widest">AI Coach</p>
            </div>
            {user && user.isAuthenticated ? (
               <div className={`w-8 h-8 rounded-full bg-gradient-to-tr from-${settings.themeColor}-400 to-${settings.themeColor}-600 flex items-center justify-center text-white font-bold text-xs shadow-lg ring-2 ring-white/10`}>
                  {user.name.charAt(0)}
               </div>
            ) : (
               <div className={`w-2 h-2 rounded-full ${getThemeColorClass('bg')} shadow-[0_0_10px_rgba(34,211,238,0.5)]`} />
            )}
         </div>

         {/* Content Area */}
         <div className="flex-1 p-4">
             {activeTab === 'timeline' && renderTimelineView()}
             {activeTab === 'plan' && renderPlanView()}
             {activeTab === 'settings' && renderSettingsView()}
         </div>

         {/* Navigation Bar */}
         <div className="fixed bottom-0 left-0 w-full z-40 bg-[#0f172a]/80 backdrop-blur-xl border-t border-white/10">
            <div className="max-w-md mx-auto grid grid-cols-3 h-20 items-center justify-items-center">
               <button onClick={() => setActiveTab('timeline')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'timeline' ? 'text-white scale-105' : 'text-white/40 hover:text-white/60'}`}>
                  <Activity className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Coach</span>
               </button>
               <button onClick={() => setActiveTab('plan')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'plan' ? 'text-white scale-105' : 'text-white/40 hover:text-white/60'}`}>
                  <Calendar className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Plan</span>
               </button>
               <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'settings' ? 'text-white scale-105' : 'text-white/40 hover:text-white/60'}`}>
                  <Settings className="w-6 h-6" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">Settings</span>
               </button>
            </div>
         </div>
      </main>

      {/* Overlays */}
      {viewingWorkout && renderWorkoutDetail()}
      
      {isLoading && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
           <Loader2 className={`w-12 h-12 ${getThemeColorClass('text')} animate-spin mb-4`} />
           <h3 className="text-xl font-bold text-white mb-2">{loadingMessage}</h3>
           <p className="text-sm text-white/50">Analyzing data points & generating insights...</p>
        </div>
      )}

      {uploadError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-sm bg-red-500/10 border border-red-500/50 backdrop-blur-md p-4 rounded-2xl flex items-start gap-3 shadow-2xl">
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
