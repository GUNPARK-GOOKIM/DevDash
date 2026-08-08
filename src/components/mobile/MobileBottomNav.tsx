import React from 'react';
import { Database, Table2, Terminal, Sparkles, MoreHorizontal } from 'lucide-react';

export type MobileTab = 'connections' | 'schema' | 'query' | 'assist' | 'more';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'connections', label: 'Connect', icon: Database },
  { id: 'schema', label: 'Schema', icon: Table2 },
  { id: 'query', label: 'Query', icon: Terminal },
  { id: 'assist', label: 'Assist', icon: Sparkles },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav className="shrink-0 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)] select-none">
      <div className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 rounded-lg active:scale-95 ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[10px] mt-0.5 tracking-tight font-sans">{t.label}</span>
              {isActive && (
                <div className="absolute top-0 w-8 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
