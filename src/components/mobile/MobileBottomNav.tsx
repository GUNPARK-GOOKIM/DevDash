import React from 'react';
import { Database, Table, Terminal, Layers, Settings, Share2 } from 'lucide-react';

export type MobileTab = 'connections' | 'tables' | 'query' | 'staging' | 'settings';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  stagedCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  stagedCount,
}) => {
  const tabs: { id: MobileTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'connections', label: 'Profiles', icon: Database },
    { id: 'tables', label: 'Tables', icon: Table },
    { id: 'query', label: 'Console', icon: Terminal },
    { id: 'staging', label: 'Staging', icon: Layers },
    { id: 'settings', label: 'Options', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)] select-none">
      <div className="flex items-center justify-around h-14 px-1 max-w-md mx-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTab(t.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 transition-all rounded-lg active:scale-95 ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {t.id === 'staging' && stagedCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-md">
                    {stagedCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-sans truncate">{t.label}</span>
              {isActive && (
                <div className="absolute top-0 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366F1]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
