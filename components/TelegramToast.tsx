"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "tg-toast-dismissed";

export default function TelegramToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Delay so it doesn't compete with initial page load
    const timer = setTimeout(() => setShow(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 panel-enter">
      <div className="flex items-center gap-3 bg-[#1a1a1a]/95 backdrop-blur-md border border-[#2a2a2a] rounded-xl px-4 py-3 shadow-2xl shadow-black/50 max-w-sm">
        <svg className="w-8 h-8 text-[#29B6F6] shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-neutral-200">Get real-time alerts</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Join our Telegram for instant strike notifications</p>
        </div>
        <a
          href="https://t.me/strikemap"
          target="_blank"
          rel="noopener noreferrer"
          onClick={dismiss}
          className="shrink-0 px-3 py-1.5 bg-[#29B6F6] hover:bg-[#0397D6] text-white text-[11px] font-semibold rounded-lg transition-colors"
        >
          Join
        </a>
        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
