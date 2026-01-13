import React, { useState, useEffect } from 'react';
import { AthleteProfile, ReadinessData, WorkoutAnalysis, AnalysisType, HrZone, AppSettings, TrainingPlan, ScheduledWorkout } from './types';
import { analyzeVitals, analyzeWorkoutImage, analyzeTcxFile, generateTrainingPlan } from './services/geminiService';
import { formatDuration, formatPace } from './services/tcxParser';
import { saveProfile, loadProfile, saveReadiness, loadReadiness, saveHistory, loadHistory, saveSettings, loadSettings, savePlan, loadPlan } from './services/storage';
import { GlassCard } from './components/GlassCard';
import { AthleteProfile as ProfileComponent } from './components/AthleteProfile';
import { Activity, Battery, Upload, Zap, ChevronRight, FileCode, ImageIcon, Loader2, TrendingUp, Mountain, History, Calendar, MapPin, Play, Settings, List, X, BarChart, Medal, Flame, Trash2, PlusCircle, CheckCircle, Clock } from 'lucide-react';

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

  // Load data on mount
  useEffect(() => {
    const loadedProfile = loadProfile();
    const loadedReadiness = loadReadiness();
    const loadedHistory = loadHistory();
    const loadedSettings = loadSettings();
    const loadedPlan = loadPlan();

    if (loadedProfile) setProfile(loadedProfile);
    if (loadedReadiness) setReadiness(loadedReadiness);
    if (loadedHistory) setHistory(loadedHistory);
    if (loadedSettings) setSettings(loadedSettings);
    if (loadedPlan) setPlan(loadedPlan);
    
    setIsDataLoaded(true);
  }, []);

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

  // Logic
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
      setUploadError("Failed to generate plan. Try again.");
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: AnalysisType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadingMessage(type === AnalysisType.VITALS ? 'Analyzing Biometrics...' : 'Analyzing Workout...');
    setUploadError(null);

    try {
      if (type === AnalysisType.VITALS) {
        const todaysWorkout = getTodaysScheduledWorkout();
        const workoutContext = todaysWorkout ? `${todaysWorkout.title}: ${todaysWorkout.description}` : undefined;

        const result = await analyzeVitals(file, profile, workoutContext);
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
          result = await analyzeWorkoutImage(file, profile, readinessContext);
        } else {
          result = await analyzeTcxFile(file, profile, readinessContext);
        }
        const newWorkout: WorkoutAnalysis = {
          id: Date.now().toString(),
          type: 'Run',
          timestamp: Date.now(),
          ...result
        };
        const updatedHistory = [newWorkout, ...history];
        setHistory(updatedHistory);
        saveHistory(updatedHistory);
        setViewingWorkout(newWorkout); 
        setActiveTab('timeline'); // Redirect to timeline to see the result
      }
    } catch (error: any) {
      console.error(error);
      setUploadError(error.message || "Failed to analyze. Please try again.");
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
            <input type="file" ref={vitalsInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, AnalysisType.VITALS)} />
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
            <input type="file" ref={workoutImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, AnalysisType.WORKOUT_IMAGE)} />

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
                    <div className="text-2xl font-bold text-white text-right">{history.filter(h => h.timestamp >= startOfWeek.getTime()).length}</div>
                 </div>
             </div>
             {/* History List */}
             <div className="space-y-2 mt-4">
                {history.slice(0, 5).map((workout) => (
                  <div key={workout.id} onClick={() => setViewingWorkout(workout)} className="flex items-center justify-between p-3 rounded-xl bg-black/20 hover:bg-black/30 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className={`w-1 h-8 rounded-full bg-${settings.themeColor}-500`}></div>
                        <div>
                           <div className="text-sm font-semibold text-white">{workout.distance || 'Run'}</div>
                           <div className="text-[10px] text-gray-400">{new Date(workout.timestamp).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="text-xs text-white">{workout.duration}</div>
                         <div className="text-[10px] text-gray-400">{workout.parsedData?.trainingLoadScore ? `Load: ${workout.parsedData.trainingLoadScore}` : workout.avgPace}</div>
                      </div>
                  </div>
                ))}
             </div>
         </GlassCard>
      </div>
    );
  };

  const renderPlanView = () => (
    <div className="space-y-6 animate-fade-in pb-20">
       {!plan ? (
         // No Plan State - Wizard
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
            <div className={`p-6 rounded-full bg-${settings.themeColor}-500/10 mb-2`}>
               <Calendar className={`w-12 h-12 ${getThemeColorClass('text')}`} />
            </div>
            <h2 className="text-2xl font-bold text-white">Build Your Plan</h2>
            <p className="text-white/50 max-w-xs">
              Configure your preferences and let the AI build a structured 4-week training schedule.
            </p>
            
            <div className="w-full max-w-xs space-y-3">
               <div>
                  <label className="text-xs font-bold text-white/40 uppercase block mb-1">Long Run Day</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                    value={planPrefs.longRunDay}
                    onChange={(e) => setPlanPrefs({...planPrefs, longRunDay: e.target.value})}
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
               </div>
               <div>
                  <label className="text-xs font-bold text-white/40 uppercase block mb-1">Workout Day</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                    value={planPrefs.workoutDay}
                    onChange={(e) => setPlanPrefs({...planPrefs, workoutDay: e.target.value})}
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                      <option key={d} value={d} className="bg-slate-900">{d}</option>
                    ))}
                  </select>
               </div>
               <div>
                  <label className="text-xs font-bold text-white/40 uppercase block mb-1">Specific Constraints / Notes</label>
                  <textarea 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm h-20"
                    placeholder="e.g. No running on Fridays."
                    value={planPrefs.notes}
                    onChange={(e) => setPlanPrefs({...planPrefs, notes: e.target.value})}
                  />
               </div>
            </div>

            <button 
              onClick={handlePlanGeneration}
              disabled={isLoading}
              className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white shadow-lg shadow-${settings.themeColor}-500/20 bg-gradient-to-r ${getThemeColorClass('from')} ${getThemeColorClass('to')} hover:scale-105 transition-transform`}
            >
               {isLoading ? <Loader2 className="animate-spin w-5 h-5"/> : <Zap className="w-5 h-5 fill-white" />}
               Generate AI Plan
            </button>
         </div>
       ) : (
         // Active Plan State
         <>
           <div className="flex justify-between items-center mb-2">
             <h2 className="text-xl font-bold text-white">Your Plan</h2>
             <button onClick={handleDeletePlan} className="p-2 rounded-full bg-white/5 text-red-400 hover:bg-white/10">
               <Trash2 className="w-4 h-4" />
             </button>
           </div>
           
           <div className={`p-4 rounded-2xl bg-gradient-to-br from-${settings.themeColor}-900/40 to-slate-900 border border-white/5`}>
              <div className="flex items-center gap-2 mb-1">
                 <Medal className={`w-4 h-4 ${getThemeColorClass('text')}`} />
                 <span className="text-xs font-bold uppercase tracking-wider text-white/60">Goal Focus</span>
              </div>
              <p className="text-white text-sm leading-snug">{plan.goal}</p>
           </div>

           <div className="space-y-6">
              {[1, 2, 3, 4].map(week => (
                <div key={week} className="space-y-3">
                   <h3 className="text-xs font-bold uppercase text-white/30 sticky top-0 bg-slate-900/90 py-2 backdrop-blur-sm z-10">Week {week}</h3>
                   <div className="grid gap-2">
                      {plan.schedule.filter(s => s.week === week).map((workout, idx) => {
                        const date = getPlanDate(plan.startDate, workout.week, workout.day);
                        const isCompleted = isWorkoutCompleted(date);
                        const isToday = date.toDateString() === new Date().toDateString();

                        return (
                          <div key={idx} className={`flex gap-3 p-3 rounded-xl border transition-colors relative overflow-hidden ${isCompleted ? 'bg-green-500/10 border-green-500/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                             {isCompleted && (
                               <div className="absolute top-2 right-2 text-green-500">
                                 <CheckCircle className="w-4 h-4" />
                               </div>
                             )}
                             
                             <div className="flex flex-col items-center pt-1 min-w-[35px]">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">{['S','M','T','W','T','F','S'][date.getDay()]}</span>
                                <span className={`text-sm font-bold ${isToday ? getThemeColorClass('text') : 'text-white'}`}>{date.getDate()}</span>
                             </div>
                             
                             <div className="flex-1 pr-6">
                                <div className="flex justify-between items-start">
                                   <h4 className={`text-sm font-semibold ${isCompleted ? 'text-white/60 line-through' : 'text-white'}`}>{workout.title}</h4>
                                   {workout.type === 'Rest' ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400">Rest</span>
                                   ) : (
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full bg-${settings.themeColor}-500/20 text-${settings.themeColor}-200`}>
                                        {workout.distanceKm ? `${workout.distanceKm}km` : workout.type}
                                      </span>
                                   )}
                                </div>
                                <p className={`text-xs mt-1 leading-relaxed ${isCompleted ? 'text-gray-500' : 'text-gray-400'}`}>{workout.description}</p>
                             </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
              ))}
           </div>
         </>
       )}
    </div>
  );

  const renderSettingsView = () => (
    <div className="space-y-6 animate-fade-in pb-20">
       <ProfileComponent profile={profile} onSave={handleProfileSave} />
       
       <GlassCard title="App Settings" icon={<Settings className="w-5 h-5 text-gray-400" />}>
          <div className="space-y-4">
             <div>
               <label className="block text-xs font-medium text-gray-400 uppercase mb-3">Theme Color</label>
               <div className="flex gap-4">
                  {(['cyan', 'purple', 'orange', 'green'] as const).map((color) => (
                    <button
                      key={color}
                      onClick={() => handleThemeChange(color)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        settings.themeColor === color ? 'border-white scale-110 shadow-lg shadow-white/20' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: `var(--color-${color}-500)` }}
                    >
                      <div className={`w-full h-full rounded-full bg-${color}-500`} />
                    </button>
                  ))}
               </div>
             </div>
             {profile.isConfigured && (
              <div className="pt-4 border-t border-white/5">
                <label className="block text-xs font-medium text-gray-400 uppercase mb-3">Zones (Karvonen)</label>
                <div className="space-y-1">
                  {calculateZones().map((z) => (
                    <div key={z.zone} className="flex justify-between text-xs py-1">
                      <span className="text-gray-300 w-16">Z{z.zone} {z.description}</span>
                      <span className="text-gray-500">{z.min}-{z.max} bpm</span>
                    </div>
                  ))}
                </div>
              </div>
             )}
          </div>
       </GlassCard>
    </div>
  );

  const renderWorkoutDetailModal = () => {
    if (!viewingWorkout) return null;
    
    // Calculate Zones for Graph
    const zonesDistribution = viewingWorkout.parsedData 
      ? calculateTimeInZones(viewingWorkout.parsedData.splits) 
      : [];

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-md overflow-y-auto animate-in slide-in-from-bottom-10">
         <div className="sticky top-0 z-10 flex justify-between items-center p-6 bg-slate-900/50 backdrop-blur-xl border-b border-white/10">
            <h2 className="text-lg font-bold">Run Analysis</h2>
            <button onClick={() => setViewingWorkout(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
               <X className="w-5 h-5" />
            </button>
         </div>
         <div className="p-6 space-y-6 max-w-md mx-auto w-full">
              {/* Main Metrics */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2.5 rounded-xl bg-black/20 text-center">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Dist</div>
                    <div className="font-bold text-md text-white">{viewingWorkout.distance || '--'}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/20 text-center">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Pace</div>
                    <div className="font-bold text-md text-white">{viewingWorkout.avgPace || '--'}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/20 text-center">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">HR</div>
                    <div className="font-bold text-md text-red-400">{viewingWorkout.avgHr || '--'}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/20 text-center">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Effort</div>
                    <div className="font-bold text-md text-orange-400">{viewingWorkout.parsedData?.trainingLoadScore || '-'}</div>
                </div>
              </div>

              {/* Advanced Graphs (Only for TCX) */}
              {viewingWorkout.parsedData && (
                <>
                   {/* Elevation Profile */}
                   <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <h5 className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3">
                        <Mountain className="w-3 h-3" /> Elevation Profile
                      </h5>
                      <div className="h-24 w-full flex items-end gap-[1px]">
                         {viewingWorkout.parsedData.seriesSample.map((pt, i) => (
                           <div key={i} className={`flex-1 bg-${settings.themeColor}-500/50 rounded-t-sm`} 
                                style={{ height: `${(pt.ele / (Math.max(...viewingWorkout.parsedData!.seriesSample.map(p => p.ele)) || 1)) * 100}%` }} 
                           />
                         ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                         <span>Start</span>
                         <span>+{Math.round(viewingWorkout.parsedData.elevationGain)}m Gain</span>
                         <span>Finish</span>
                      </div>
                   </div>

                   {/* HR Zones Chart */}
                   <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <h5 className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3">
                        <Activity className="w-3 h-3" /> Heart Rate Zones
                      </h5>
                      <div className="space-y-2">
                        {calculateZones().map((z, i) => (
                           <div key={z.zone} className="flex items-center gap-2 text-xs">
                              <span className="w-8 text-gray-500">Z{z.zone}</span>
                              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                 <div 
                                   className={`h-full ${i < 2 ? 'bg-blue-400' : i < 3 ? 'bg-green-400' : i < 4 ? 'bg-orange-400' : 'bg-red-500'}`} 
                                   style={{ width: `${zonesDistribution[i]}%` }} 
                                 />
                              </div>
                              <span className="w-8 text-right text-white">{Math.round(zonesDistribution[i])}%</span>
                           </div>
                        ))}
                      </div>
                   </div>

                   {/* Best Efforts */}
                   {viewingWorkout.parsedData.bestEfforts && viewingWorkout.parsedData.bestEfforts.length > 0 && (
                     <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <h5 className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3">
                          <Medal className="w-3 h-3 text-yellow-500" /> Best Efforts
                        </h5>
                        <div className="grid grid-cols-3 gap-2">
                           {viewingWorkout.parsedData.bestEfforts.map((effort, i) => (
                             <div key={i} className="bg-black/20 rounded-lg p-2 text-center">
                                <div className="text-[10px] text-gray-500 uppercase">{effort.distanceLabel}</div>
                                <div className="text-sm font-bold text-white">{formatDuration(effort.timeSeconds)}</div>
                                <div className="text-[10px] text-gray-400">{formatPace(effort.paceSeconds)}</div>
                             </div>
                           ))}
                        </div>
                     </div>
                   )}
                </>
              )}

              {/* AI Feedback */}
              <div className="space-y-3">
                <h4 className={`flex items-center gap-2 text-sm font-bold ${getThemeColorClass('text')}`}>
                  <Zap className="w-4 h-4" /> Coach's Feedback
                </h4>
                <p className={`text-sm text-gray-300 leading-relaxed bg-${settings.themeColor}-500/10 p-4 rounded-xl border border-${settings.themeColor}-500/20`}>
                  {viewingWorkout.aiCoachFeedback}
                </p>
              </div>

              {/* Next Steps */}
              <div className="space-y-3 pb-10">
                <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                  <ChevronRight className="w-4 h-4" /> Next Workout
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/10">
                  {viewingWorkout.nextWorkoutSuggestion}
                </p>
              </div>
         </div>
      </div>
    );
  };

  if (!isDataLoaded) return null;

  return (
    <div className="min-h-screen relative font-sans text-white/90 bg-slate-900 selection:bg-cyan-500 selection:text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
         <div className={`absolute top-0 left-1/4 w-96 h-96 bg-${settings.themeColor}-600/20 rounded-full blur-3xl animate-blob mix-blend-screen filter`} />
         <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-blob animation-delay-2000 mix-blend-screen filter" />
         <div className="absolute inset-0 bg-slate-900/60" />
      </div>

      <div className="max-w-md mx-auto min-h-screen flex flex-col relative">
        <header className="flex justify-between items-center p-6 pb-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Run Boy <span className={getThemeColorClass('text')}>Run</span></h1>
            <p className="text-xs text-white/50">
                {activeTab === 'plan' ? "Plan Generator" : activeTab === 'timeline' ? "Training Log" : "Settings"}
            </p>
          </div>
        </header>

        {isLoading && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-900/90 border border-white/10 shadow-2xl">
              <Loader2 className={`w-10 h-10 ${getThemeColorClass('text')} animate-spin`} />
              <p className="text-white font-medium animate-pulse">{loadingMessage}</p>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="mx-6 mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex justify-between items-center">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 p-6 pt-2 overflow-y-auto custom-scrollbar">
           {activeTab === 'plan' && renderPlanView()}
           {activeTab === 'timeline' && renderTimelineView()}
           {activeTab === 'settings' && renderSettingsView()}
        </div>

        <div className="sticky bottom-6 mx-6 mb-6 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl p-2 z-40">
           <div className="flex justify-around items-center">
              <button 
                onClick={() => setActiveTab('timeline')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'timeline' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                 <List className="w-5 h-5" />
                 <span className="text-[10px] font-medium">Timeline</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('plan')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'plan' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                 <Calendar className="w-5 h-5" />
                 <span className="text-[10px] font-medium">Plan</span>
              </button>

              <button 
                onClick={() => setActiveTab('settings')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                 <Settings className="w-5 h-5" />
                 <span className="text-[10px] font-medium">Settings</span>
              </button>
           </div>
        </div>
        {renderWorkoutDetailModal()}
      </div>
    </div>
  );
};

export default App;