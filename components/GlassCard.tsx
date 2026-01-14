import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', title, icon }) => {
  return (
    <div className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent backdrop-blur-2xl shadow-xl transition-all duration-500 hover:shadow-cyan-500/10 hover:border-white/20 ${className}`}>
      {/* Liquid internal glow/noise texture could go here, for now using pure CSS layers */}
      
      {/* Top rim highlight for 3D glass effect */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-50" />
      
      {/* Subtle shine gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.03] via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 p-6">
        {(title || icon) && (
          <div className="flex items-center gap-3 mb-4 text-white/90">
            {icon && <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{icon}</span>}
            {title && <h3 className="text-lg font-semibold tracking-wide uppercase text-white/90 drop-shadow-md">{title}</h3>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
