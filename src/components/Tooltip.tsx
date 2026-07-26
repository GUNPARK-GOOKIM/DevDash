import React, { useState, useRef } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 600); // 600ms hover delay
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {visible && (
        <div className="absolute z-[100] bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 text-[11px] font-sans font-medium text-[#E8E8EA] bg-[#2A2A2E] border border-[rgba(255,255,255,0.1)] rounded shadow-lg whitespace-nowrap pointer-events-none">
          {content}
        </div>
      )}
    </div>
  );
};
