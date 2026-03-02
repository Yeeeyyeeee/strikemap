"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
}

function getOrCreateNickname(): string {
  if (typeof window === "undefined") return "Anon";
  let nick = sessionStorage.getItem("strikemap-chat-nick");
  if (!nick) {
    const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
    nick = `Anon-${hex}`;
    sessionStorage.setItem("strikemap-chat-nick", nick);
  }
  return nick;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default memo(function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const nickname = useRef(getOrCreateNickname());
  const lastTimestamp = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);

  const openRef = useRef(open);
  openRef.current = open;

  // Initial fetch (once) to get unread count
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    fetch(`/api/chat`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(data.messages);
          setUnread(data.messages.length);
          lastTimestamp.current = data.messages[data.messages.length - 1].timestamp;
        }
      })
      .catch(() => {});
  }, []);

  // Poll for new messages — stable interval, no dependency bugs
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat?since=${lastTimestamp.current}`);
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const newMsgs = data.messages.filter((m: ChatMessage) => !ids.has(m.id));
            if (newMsgs.length === 0) return prev;
            if (!openRef.current) setUnread((u) => u + newMsgs.length);
            return [...prev, ...newMsgs];
          });
          lastTimestamp.current = data.messages[data.messages.length - 1].timestamp;
        }
      } catch {
        // Ignore
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Clear unread when opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");

    // Optimistic add
    const optimisticMsg: ChatMessage = {
      id: `opt-${Date.now()}`,
      text,
      nickname: nickname.current,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, nickname: nickname.current }),
      });
      const data = await res.json();
      if (data.message) {
        // Replace optimistic message with real one
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMsg.id ? data.message : m))
        );
        lastTimestamp.current = data.message.timestamp;
      }
    } catch {
      // Keep optimistic message
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`fixed right-4 bottom-4 z-50 w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
          open
            ? "bg-neutral-700 border-neutral-600 text-white"
            : "bg-[#1a1a1a]/90 backdrop-blur-sm border-[#2a2a2a] text-neutral-500 hover:text-neutral-300"
        }`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed right-4 bottom-16 z-50 w-[calc(100vw-2rem)] md:w-80 h-96 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
            <span
              className="text-xs font-semibold text-neutral-400 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Live Chat
            </span>
            <span className="text-[10px] text-neutral-600">{nickname.current}</span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messages.length === 0 && (
              <div className="text-neutral-600 text-xs text-center mt-8">
                No messages yet. Say something!
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <span className="font-semibold text-neutral-300 text-xs">{msg.nickname}</span>
                <span className="text-neutral-600 text-[10px] ml-1.5">{relativeTime(msg.timestamp)}</span>
                <p className="text-neutral-400 text-xs mt-0.5 break-words">{msg.text}</p>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-[#2a2a2a] flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
});
