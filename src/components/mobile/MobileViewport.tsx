import React from 'react';
import { MobileBottomNav, MobileTab } from './MobileBottomNav';

interface MobileViewportProps {
  title: string;
  subtitle?: string;
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export const MobileViewport: React.FC<MobileViewportProps> = ({
  title,
  subtitle,
  activeTab,
  onSelectTab,
  headerRight,
  children,
}) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden pt-[env(safe-area-inset-top)]">
      <header className="h-12 bg-slate-900/90 border-b border-slate-800/80 px-3 flex items-center justify-between shrink-0 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2 min-w-0">
          <img src="/logo.png" alt="DevDash" className="w-6 h-6 object-contain rounded-full shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-sm tracking-tight truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1 shrink-0">{headerRight}</div>
      </header>

      <main className="flex-1 overflow-hidden relative min-h-0">{children}</main>

      <MobileBottomNav activeTab={activeTab} onSelectTab={onSelectTab} />
    </div>
  );
};
