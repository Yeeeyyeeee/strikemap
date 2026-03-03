"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import SuggestionsPanel from "./SuggestionsPanel";

interface ReplyTo {
  id: string;
  nickname: string;
  text: string;
}

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  role?: "dev";
  replyTo?: ReplyTo;
}

export type ChatTab = "chat" | "suggestions";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: ChatTab;
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

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export default memo(function ChatPanel({ open, onClose, defaultTab }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<ChatTab>(defaultTab || "chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyTo | null>(null);
  const nickname = useRef(getOrCreateNickname());
  const lastTimestamp = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const openRef = useRef(open);
  openRef.current = open;

  // Sync tab when parent changes defaultTab (e.g. header suggestions button)
  useEffect(() => {
    if (defaultTab && open) setActiveTab(defaultTab);
  }, [defaultTab, open]);

  // Initial fetch (once)
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    fetch(`/api/chat`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(data.messages);
          lastTimestamp.current = data.messages[data.messages.length - 1].timestamp;
        }
      })
      .catch(() => {});
  }, []);

  // Poll for new messages
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

  const handleReply = useCallback((msg: ChatMessage) => {
    setReplyingTo({
      id: msg.id,
      nickname: msg.nickname,
      text: msg.text.slice(0, 100),
    });
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-neutral-800/50");
      setTimeout(() => el.classList.remove("bg-neutral-800/50"), 1500);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    const currentReply = replyingTo;
    setReplyingTo(null);

    const optimisticMsg: ChatMessage = {
      id: `opt-${Date.now()}`,
      text,
      nickname: nickname.current,
      timestamp: Date.now(),
      ...(currentReply ? { replyTo: currentReply } : {}),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          nickname: nickname.current,
          ...(currentReply ? { replyTo: currentReply } : {}),
        }),
      });
      const data = await res.json();
      if (data.message) {
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
  }, [input, sending, replyingTo]);

  if (!open) return null;

  return (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden bg-[#0a0a0a] md:bg-[#1a1a1a] md:border md:border-[#2a2a2a] md:rounded-lg md:shadow-2xl"
      style={isMobile
        ? { top: "3.5rem", bottom: "3.5rem", left: 0, right: 0, overscrollBehaviorX: "none", touchAction: "pan-y pinch-zoom" }
        : { top: "4rem", right: "19rem", width: "20rem", height: "30rem" }
      }
    >
      {/* Header with tabs */}
      <div className="border-b border-[#2a2a2a] bg-[#0a0a0a] md:bg-transparent">
        <div className="px-3 py-2 md:px-2 md:py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-0.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md p-0.5">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                activeTab === "chat"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("suggestions")}
              className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                activeTab === "suggestions"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Suggestions
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-600">{nickname.current}</span>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-300 p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {activeTab === "suggestions" ? (
        <SuggestionsPanel />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-3 py-3 md:py-2 space-y-3 md:space-y-2">
            {messages.length === 0 && (
              <div className="text-neutral-600 text-sm md:text-xs text-center mt-8">
                No messages yet. Say something!
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} id={`chat-msg-${msg.id}`} className="group rounded px-1 -mx-1 transition-colors">
                {/* Reply preview */}
                {msg.replyTo && (
                  <button
                    onClick={() => scrollToMessage(msg.replyTo!.id)}
                    className="flex items-center gap-1.5 mb-1 pl-2 border-l-2 border-neutral-600 text-[10px] text-neutral-500 hover:text-neutral-400 transition-colors w-full text-left"
                  >
                    <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 10l4-4m0 0l4 4m-4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-semibold text-neutral-400">{msg.replyTo.nickname}</span>
                    <span className="truncate">{msg.replyTo.text}</span>
                  </button>
                )}
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-neutral-300 text-sm md:text-xs">{msg.nickname}</span>
                    {msg.role === "dev" && (
                      <span className="ml-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">dev</span>
                    )}
                    <span className="text-neutral-600 text-[10px] ml-1.5">{relativeTime(msg.timestamp)}</span>
                    <p className="text-neutral-400 text-sm md:text-xs mt-0.5 break-words">{msg.text}</p>
                  </div>
                  {/* Reply button */}
                  <button
                    onClick={() => handleReply(msg)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 mt-0.5 p-1 rounded hover:bg-neutral-700/50 text-neutral-600 hover:text-neutral-400 transition-all shrink-0"
                    title="Reply"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 10l4-4m0 0l4 4m-4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Reply bar */}
          {replyingTo && (
            <div className="px-3 py-1.5 border-t border-[#2a2a2a] bg-[#111] flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[10px]">
                <div className="w-0.5 h-4 bg-red-500/50 rounded shrink-0" />
                <span className="text-neutral-500">Replying to</span>
                <span className="font-semibold text-neutral-400">{replyingTo.nickname}</span>
                <span className="text-neutral-600 truncate">{replyingTo.text}</span>
              </div>
              <button
                onClick={cancelReply}
                className="text-neutral-600 hover:text-neutral-400 p-0.5 shrink-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-2 py-2 border-t border-[#2a2a2a] flex gap-1.5 safe-area-bottom min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={replyingTo ? `Reply to ${replyingTo.nickname}...` : "Type a message..."}
              maxLength={500}
              className="flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-2.5 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-40 transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
});
