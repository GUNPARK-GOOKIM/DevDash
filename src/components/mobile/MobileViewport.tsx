import React, { useState } from 'react';
import { MobileBottomNav, MobileTab } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';
import { ConnectionConfig, TableItem } from '../../types';
import { Menu, Share2, Download, Settings, Database, Plus, RefreshCw } from 'lucide-react';

interface MobileViewportProps {
  connections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  tables: TableItem[];
  stagedCount: number;
  onSelectConnection: (conn: ConnectionConfig) => void;
  onSelectTable: (tableName: string) => void;
  onOpenNewConnectionModal: () => void;
  onShareConnection: (conn: ConnectionConfig) => void;
  onOpenImportShared: () => void;
  onOpenSettings: () => void;
  children: React.ReactNode;
}

export const MobileViewport: React.FC<MobileViewportProps> = ({
  connections,
  activeConnection,
  tables,
  stagedCount,
  onSelectConnection,
  onSelectTable,
  onOpenNewConnectionModal,
  onShareConnection,
  onOpenImportShared,
  onOpenSettings,
  children,
}) => {
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('tables');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleTabChange = (tab: MobileTab) => {
    setActiveMobileTab(tab);
    if (tab === 'connections') {
      setIsDrawerOpen(true);
    } else if (tab === 'settings') {
      onOpenSettings();
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden pt-[env(safe-area-inset-top)]">
      {/* Mobile Top Header */}
      <header className="h-12 bg-slate-900/90 border-b border-slate-800/80 px-3 flex items-center justify-between shrink-0 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 shrink-0"
            title="Open Drawer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png" alt="DevDash" className="w-6 h-6 object-contain rounded-full shrink-0" />
          <span className="font-bold text-sm tracking-tight truncate">
            {activeConnection ? activeConnection.name : 'DevDash'}
          </span>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {activeConnection && (
            <button
              onClick={() => onShareConnection(activeConnection)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800"
              title="Share Connection"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onOpenImportShared}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
            title="Import Shared"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Mobile Workspace Content */}
      <main className="flex-1 overflow-hidden relative pb-14">
        {children}
      </main>

      {/* Bottom Touch Navigation Bar */}
      <MobileBottomNav
        activeTab={activeMobileTab}
        onSelectTab={handleTabChange}
        stagedCount={stagedCount}
      />

      {/* Touch Drawer for Profile and Table switching */}
      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        connections={connections}
        activeConnection={activeConnection}
        tables={tables}
        onSelectConnection={onSelectConnection}
        onSelectTable={onSelectTable}
        onOpenNewConnectionModal={onOpenNewConnectionModal}
        onShareConnection={onShareConnection}
        onOpenImportShared={onOpenImportShared}
      />
    </div>
  );
};
