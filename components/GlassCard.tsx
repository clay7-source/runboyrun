import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', title, icon }) => {
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl ${className}`}>
      {/* Shine effect */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-6">
        {(title || icon) && (
          <div className="flex items-center gap-3 mb-4 text-white/90">
            {icon && <span className="text-cyan-400">{icon}</span>}
            {title && <h3 className="text-lg font-semibold tracking-wide uppercase text-white/80">{title}</h3>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
