import React, { useState } from 'react';
import { AthleteProfile as ProfileType } from '../types';
import { GlassCard } from './GlassCard';
import { User, Activity, Heart, Save, Trophy, Scale, Calendar } from 'lucide-react';

interface Props {
  profile: ProfileType;
  onSave: (profile: ProfileType) => void;
}

export const AthleteProfile: React.FC<Props> = ({ profile, onSave }) => {
  const [formData, setFormData] = useState<ProfileType>(profile);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'age' || name === 'restingHr' || name === 'maxHr' || name === 'weight' || name === 'weeklyMileage') 
        ? Number(value) 
        : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, isConfigured: true });
  };

  const inputClass = "w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all text-sm";
  const labelClass = "block text-xs font-medium text-gray-400 uppercase mb-1 flex items-center gap-1";

  return (
    <GlassCard title="Athlete Profile" icon={<User className="w-5 h-5" />}>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} placeholder="Runner Name" />
          </div>
          <div>
            <label className={labelClass}>Gender</label>
            <select name="gender" value={formData.gender} onChange={handleChange} className={inputClass}>
               <option value="Male">Male</option>
               <option value="Female">Female</option>
               <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Physiology */}
        <div className="grid grid-cols-4 gap-2">
           <div>
            <label className={labelClass}>Age</label>
            <input type="number" name="age" value={formData.age} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}><Scale className="w-3 h-3"/> Wgt(kg)</label>
            <input type="number" name="weight" value={formData.weight} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}><Heart className="w-3 h-3 text-red-400" /> Rest</label>
            <input type="number" name="restingHr" value={formData.restingHr} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}><Activity className="w-3 h-3 text-red-500" /> Max</label>
            <input type="number" name="maxHr" value={formData.maxHr} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        {/* Training Context */}
        <div>
           <label className={labelClass}><Trophy className="w-3 h-3 text-yellow-400"/> Primary Goal</label>
           <input type="text" name="runningGoal" value={formData.runningGoal} onChange={handleChange} className={inputClass} placeholder="e.g. Sub 4hr Marathon" />
        </div>

        <div>
           <label className={labelClass}><Calendar className="w-3 h-3"/> Avg Weekly Km</label>
           <input type="number" name="weeklyMileage" value={formData.weeklyMileage} onChange={handleChange} className={inputClass} placeholder="e.g. 40" />
        </div>

        <div>
           <label className={labelClass}>History / PBs</label>
           <textarea 
             name="personalBests" 
             value={formData.personalBests} 
             onChange={handleChange} 
             className={`${inputClass} h-20 resize-none`} 
             placeholder="5k: 20:00, 10k: 42:30. Running for 3 years."
           />
        </div>

        <button
          type="submit"
          className="w-full mt-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save & Calibrate
        </button>
      </form>
    </GlassCard>
  );
};