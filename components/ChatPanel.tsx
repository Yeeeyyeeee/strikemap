"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import SuggestionsPanel from "./SuggestionsPanel";
import ChangelogPanel from "./ChangelogPanel";
import { isOffensiveNickname } from "@/lib/profanityFilter";

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
  flag?: string;
  role?: "dev";
  replyTo?: ReplyTo;
}

export type ChatTab = "chat" | "suggestions" | "changes";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: ChatTab;
}

const NICK_STORAGE_KEY = "strikemap-chat-nick-v2";
const CLIENT_ID_KEY = "strikemap-client-id";
const MUTED_USERS_KEY = "strikemap-chat-muted";
const FLAG_STORAGE_KEY = "strikemap-chat-flag";

// All sovereign nation flags, organized by region
const FLAGS = [
  // North America & Caribbean
  "\u{1F1FA}\u{1F1F8}","\u{1F1E8}\u{1F1E6}","\u{1F1F2}\u{1F1FD}","\u{1F1E8}\u{1F1FA}","\u{1F1EF}\u{1F1F2}","\u{1F1ED}\u{1F1F9}","\u{1F1E9}\u{1F1F4}","\u{1F1F5}\u{1F1F7}","\u{1F1F9}\u{1F1F9}","\u{1F1E7}\u{1F1E7}","\u{1F1E7}\u{1F1F8}","\u{1F1E6}\u{1F1EC}","\u{1F1F0}\u{1F1F3}","\u{1F1F1}\u{1F1E8}","\u{1F1FB}\u{1F1E8}","\u{1F1EC}\u{1F1E9}","\u{1F1E9}\u{1F1F2}",
  // Central America
  "\u{1F1EC}\u{1F1F9}","\u{1F1E7}\u{1F1FF}","\u{1F1F8}\u{1F1FB}","\u{1F1ED}\u{1F1F3}","\u{1F1F3}\u{1F1EE}","\u{1F1E8}\u{1F1F7}","\u{1F1F5}\u{1F1E6}",
  // South America
  "\u{1F1E7}\u{1F1F7}","\u{1F1E6}\u{1F1F7}","\u{1F1E8}\u{1F1F4}","\u{1F1E8}\u{1F1F1}","\u{1F1F5}\u{1F1EA}","\u{1F1FB}\u{1F1EA}","\u{1F1EA}\u{1F1E8}","\u{1F1E7}\u{1F1F4}","\u{1F1F5}\u{1F1FE}","\u{1F1FA}\u{1F1FE}","\u{1F1EC}\u{1F1FE}","\u{1F1F8}\u{1F1F7}",
  // Western Europe
  "\u{1F1EC}\u{1F1E7}","\u{1F1EE}\u{1F1EA}","\u{1F1EB}\u{1F1F7}","\u{1F1E9}\u{1F1EA}","\u{1F1F3}\u{1F1F1}","\u{1F1E7}\u{1F1EA}","\u{1F1F1}\u{1F1FA}","\u{1F1E6}\u{1F1F9}","\u{1F1E8}\u{1F1ED}","\u{1F1F1}\u{1F1EE}","\u{1F1F2}\u{1F1E8}","\u{1F1E6}\u{1F1E9}",
  // Northern Europe
  "\u{1F1F8}\u{1F1EA}","\u{1F1F3}\u{1F1F4}","\u{1F1E9}\u{1F1F0}","\u{1F1EB}\u{1F1EE}","\u{1F1EE}\u{1F1F8}","\u{1F1EA}\u{1F1EA}","\u{1F1F1}\u{1F1FB}","\u{1F1F1}\u{1F1F9}",
  // Southern Europe
  "\u{1F1EE}\u{1F1F9}","\u{1F1EA}\u{1F1F8}","\u{1F1F5}\u{1F1F9}","\u{1F1EC}\u{1F1F7}","\u{1F1F2}\u{1F1F9}","\u{1F1E8}\u{1F1FE}","\u{1F1F8}\u{1F1F2}","\u{1F1FB}\u{1F1E6}",
  // Eastern Europe & Balkans
  "\u{1F1F5}\u{1F1F1}","\u{1F1E8}\u{1F1FF}","\u{1F1F8}\u{1F1F0}","\u{1F1ED}\u{1F1FA}","\u{1F1F7}\u{1F1F4}","\u{1F1E7}\u{1F1EC}","\u{1F1ED}\u{1F1F7}","\u{1F1F8}\u{1F1EE}","\u{1F1F7}\u{1F1F8}","\u{1F1E7}\u{1F1E6}","\u{1F1F2}\u{1F1EA}","\u{1F1F2}\u{1F1F0}","\u{1F1E6}\u{1F1F1}","\u{1F1FD}\u{1F1F0}","\u{1F1F2}\u{1F1E9}","\u{1F1FA}\u{1F1E6}","\u{1F1E7}\u{1F1FE}","\u{1F1F7}\u{1F1FA}",
  // Middle East
  "\u{1F1EE}\u{1F1F1}","\u{1F1F5}\u{1F1F8}","\u{1F1EE}\u{1F1F7}","\u{1F1EE}\u{1F1F6}","\u{1F1F8}\u{1F1E6}","\u{1F1E6}\u{1F1EA}","\u{1F1F6}\u{1F1E6}","\u{1F1F0}\u{1F1FC}","\u{1F1E7}\u{1F1ED}","\u{1F1F4}\u{1F1F2}","\u{1F1FE}\u{1F1EA}","\u{1F1EF}\u{1F1F4}","\u{1F1F1}\u{1F1E7}","\u{1F1F8}\u{1F1FE}","\u{1F1F9}\u{1F1F7}",
  // North Africa
  "\u{1F1EA}\u{1F1EC}","\u{1F1F1}\u{1F1FE}","\u{1F1F9}\u{1F1F3}","\u{1F1E9}\u{1F1FF}","\u{1F1F2}\u{1F1E6}","\u{1F1F2}\u{1F1F7}",
  // West Africa
  "\u{1F1F3}\u{1F1EC}","\u{1F1EC}\u{1F1ED}","\u{1F1F8}\u{1F1F3}","\u{1F1EC}\u{1F1F2}","\u{1F1F2}\u{1F1F1}","\u{1F1E7}\u{1F1EB}","\u{1F1F3}\u{1F1EA}","\u{1F1EC}\u{1F1F3}","\u{1F1F8}\u{1F1F1}","\u{1F1F1}\u{1F1F7}","\u{1F1E8}\u{1F1EE}","\u{1F1F9}\u{1F1EC}","\u{1F1E7}\u{1F1EF}","\u{1F1E8}\u{1F1FB}","\u{1F1EC}\u{1F1FC}",
  // East Africa
  "\u{1F1F0}\u{1F1EA}","\u{1F1EA}\u{1F1F9}","\u{1F1F9}\u{1F1FF}","\u{1F1FA}\u{1F1EC}","\u{1F1F7}\u{1F1FC}","\u{1F1E7}\u{1F1EE}","\u{1F1F8}\u{1F1F4}","\u{1F1E9}\u{1F1EF}","\u{1F1EA}\u{1F1F7}","\u{1F1F8}\u{1F1E9}","\u{1F1F8}\u{1F1F8}",
  // Central & Southern Africa
  "\u{1F1FF}\u{1F1E6}","\u{1F1E8}\u{1F1E9}","\u{1F1E8}\u{1F1EC}","\u{1F1EC}\u{1F1E6}","\u{1F1E8}\u{1F1F2}","\u{1F1E8}\u{1F1EB}","\u{1F1F9}\u{1F1E9}","\u{1F1E6}\u{1F1F4}","\u{1F1F2}\u{1F1FF}","\u{1F1FF}\u{1F1F2}","\u{1F1FF}\u{1F1FC}","\u{1F1E7}\u{1F1FC}","\u{1F1F3}\u{1F1E6}","\u{1F1F1}\u{1F1F8}","\u{1F1F8}\u{1F1FF}","\u{1F1F2}\u{1F1EC}","\u{1F1F2}\u{1F1FA}","\u{1F1F0}\u{1F1F2}","\u{1F1F8}\u{1F1E8}","\u{1F1EC}\u{1F1F6}","\u{1F1F8}\u{1F1F9}",
  // South Asia
  "\u{1F1EE}\u{1F1F3}","\u{1F1F5}\u{1F1F0}","\u{1F1E7}\u{1F1E9}","\u{1F1F1}\u{1F1F0}","\u{1F1F3}\u{1F1F5}","\u{1F1E7}\u{1F1F9}","\u{1F1F2}\u{1F1FB}","\u{1F1E6}\u{1F1EB}",
  // Central Asia & Caucasus
  "\u{1F1F0}\u{1F1FF}","\u{1F1FA}\u{1F1FF}","\u{1F1F9}\u{1F1F2}","\u{1F1F0}\u{1F1EC}","\u{1F1F9}\u{1F1EF}","\u{1F1EC}\u{1F1EA}","\u{1F1E6}\u{1F1F2}","\u{1F1E6}\u{1F1FF}","\u{1F1F2}\u{1F1F3}",
  // East Asia
  "\u{1F1E8}\u{1F1F3}","\u{1F1EF}\u{1F1F5}","\u{1F1F0}\u{1F1F7}","\u{1F1F0}\u{1F1F5}","\u{1F1F9}\u{1F1FC}",
  // Southeast Asia
  "\u{1F1F5}\u{1F1ED}","\u{1F1FB}\u{1F1F3}","\u{1F1F9}\u{1F1ED}","\u{1F1F2}\u{1F1FE}","\u{1F1EE}\u{1F1E9}","\u{1F1F8}\u{1F1EC}","\u{1F1F2}\u{1F1F2}","\u{1F1F0}\u{1F1ED}","\u{1F1F1}\u{1F1E6}","\u{1F1E7}\u{1F1F3}","\u{1F1F9}\u{1F1F1}",
  // Oceania
  "\u{1F1E6}\u{1F1FA}","\u{1F1F3}\u{1F1FF}","\u{1F1F5}\u{1F1EC}","\u{1F1EB}\u{1F1EF}","\u{1F1F8}\u{1F1E7}","\u{1F1FB}\u{1F1FA}","\u{1F1FC}\u{1F1F8}","\u{1F1F9}\u{1F1F4}","\u{1F1F9}\u{1F1FB}","\u{1F1F0}\u{1F1EE}","\u{1F1F2}\u{1F1ED}","\u{1F1F5}\u{1F1FC}","\u{1F1F3}\u{1F1F7}","\u{1F1EB}\u{1F1F2}",
];

function getSavedFlag(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(FLAG_STORAGE_KEY);
}

function saveFlag(flag: string | null): void {
  if (typeof window === "undefined") return;
  if (flag) localStorage.setItem(FLAG_STORAGE_KEY, flag);
  else localStorage.removeItem(FLAG_STORAGE_KEY);
}

function getMutedUsers(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(MUTED_USERS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveMutedUsers(muted: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTED_USERS_KEY, JSON.stringify([...muted]));
}

const DEFAULT_W = 380;
const MIN_W = 340;
const MAX_W = 500;
const DEFAULT_H = 480;
const MIN_H = 300;
const MAX_H = 800;

function getSavedNickname(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NICK_STORAGE_KEY);
}

function saveNickname(nick: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NICK_STORAGE_KEY, nick);
}

function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function isValidNickname(nick: string): boolean {
  return /^[A-Za-z]{4}-\d{4}$/.test(nick);
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
  const [nicknameReady, setNicknameReady] = useState(() => !!getSavedNickname());
  const [changingNick, setChangingNick] = useState(false);
  const [nickInput, setNickInput] = useState({ letters: "", numbers: "" });
  const [nickError, setNickError] = useState("");
  const [nickLoading, setNickLoading] = useState(false);
  const nicknameRef = useRef(getSavedNickname() || "");
  const numbersInputRef = useRef<HTMLInputElement>(null);
  const lastTimestamp = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(() => getMutedUsers());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedFlag, setSelectedFlag] = useState<string | null>(() => getSavedFlag());
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);
  const flagDropdownRef = useRef<HTMLDivElement>(null);
  const flagButtonRef = useRef<HTMLButtonElement>(null);
  const flagRef = useRef(getSavedFlag());
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("strikemap-chat-liked");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [heartAnimId, setHeartAnimId] = useState<string | null>(null);

  // ── Position & size state (desktop only) ──
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  const [height, setHeight] = useState(DEFAULT_H);

  // ── Drag refs ──
  const moving = useRef(false);
  const moveStartX = useRef(0);
  const moveStartY = useRef(0);
  const moveStartPos = useRef({ x: 0, y: 0 });

  // ── Resize refs ──
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartY = useRef(0);
  const resizeStartW = useRef(DEFAULT_W);
  const resizeStartH = useRef(DEFAULT_H);

  useEffect(() => setMounted(true), []);

  const openRef = useRef(open);
  openRef.current = open;

  const getDefaultPos = useCallback(() => {
    if (typeof window === "undefined") return { x: 100, y: 80 };
    return {
      x: window.innerWidth - DEFAULT_W - 300,
      y: 64,
    };
  }, []);

  // ── Move handlers ──
  const onMoveStart = useCallback((clientX: number, clientY: number) => {
    moving.current = true;
    moveStartX.current = clientX;
    moveStartY.current = clientY;
    moveStartPos.current = pos || getDefaultPos();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }, [pos, getDefaultPos]);

  const onMoveMove = useCallback((clientX: number, clientY: number) => {
    if (!moving.current) return;
    const dx = clientX - moveStartX.current;
    const dy = clientY - moveStartY.current;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 100, moveStartPos.current.x + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, moveStartPos.current.y + dy)),
    });
  }, []);

  const onMoveEnd = useCallback(() => {
    if (!moving.current) return;
    moving.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  // ── Resize handlers ──
  const onResizeStart = useCallback((clientX: number, clientY: number) => {
    resizing.current = true;
    resizeStartX.current = clientX;
    resizeStartY.current = clientY;
    resizeStartW.current = width;
    resizeStartH.current = height;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  }, [width, height]);

  const onResizeMove = useCallback((clientX: number, clientY: number) => {
    if (!resizing.current) return;
    const dx = clientX - resizeStartX.current;
    const dy = clientY - resizeStartY.current;
    setWidth(Math.min(MAX_W, Math.max(MIN_W, resizeStartW.current + dx)));
    setHeight(Math.min(MAX_H, Math.max(MIN_H, resizeStartH.current + dy)));
  }, []);

  const onResizeEnd = useCallback(() => {
    if (!resizing.current) return;
    resizing.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  // ── Global listeners ──
  // Mouse listeners are always active; touch listeners only added during drag/resize
  // to avoid a non-passive window touchmove listener that blocks native scroll.
  const dragging = useRef(false);
  const touchHandlersRef = useRef<{ move: (e: TouchEvent) => void; up: () => void } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      onMoveMove(e.clientX, e.clientY);
      onResizeMove(e.clientX, e.clientY);
    };
    const onUp = () => {
      onMoveEnd();
      onResizeEnd();
      // Remove touch listeners when drag ends
      if (dragging.current && touchHandlersRef.current) {
        dragging.current = false;
        window.removeEventListener("touchmove", touchHandlersRef.current.move);
        window.removeEventListener("touchend", touchHandlersRef.current.up);
        window.removeEventListener("touchcancel", touchHandlersRef.current.up);
        touchHandlersRef.current = null;
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      // Cleanup any lingering touch listeners
      if (touchHandlersRef.current) {
        window.removeEventListener("touchmove", touchHandlersRef.current.move);
        window.removeEventListener("touchend", touchHandlersRef.current.up);
        window.removeEventListener("touchcancel", touchHandlersRef.current.up);
      }
    };
  }, [onMoveMove, onMoveEnd, onResizeMove, onResizeEnd]);

  // Helper to attach touch listeners only when a drag/resize starts
  const startTouchDrag = useCallback(() => {
    if (dragging.current) return;
    dragging.current = true;
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      onMoveMove(e.touches[0].clientX, e.touches[0].clientY);
      onResizeMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onUp = () => {
      onMoveEnd();
      onResizeEnd();
      dragging.current = false;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
      touchHandlersRef.current = null;
    };
    touchHandlersRef.current = { move: onTouchMove, up: onUp };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  }, [onMoveMove, onMoveEnd, onResizeMove, onResizeEnd]);

  // Sync tab when parent changes defaultTab
  useEffect(() => {
    if (defaultTab && open) setActiveTab(defaultTab);
  }, [defaultTab, open]);

  // Initial fetch (once) + re-claim saved nickname
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
        if (data.pinned) setPinnedMessage(data.pinned);
        if (data.likes) setLikes(data.likes);
      })
      .catch(() => {});

    // Re-claim saved nickname on load (refreshes TTL, registers if not yet)
    const saved = getSavedNickname();
    if (saved) {
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim-nickname", nickname: saved, clientId: getClientId(), flag: getSavedFlag() || undefined }),
      }).then(async (res) => {
        if (res.status === 409) {
          // Someone else took this name — force re-pick
          setNicknameReady(false);
          setNickError("Your username was taken by someone else. Please pick a new one.");
        }
      }).catch(() => {});
    }
  }, []);

  // Poll for new messages + pinned + likes
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
        if (data.pinned !== undefined) setPinnedMessage(data.pinned);
        if (data.likes) setLikes((prev) => ({ ...prev, ...data.likes }));
      } catch {
        // Ignore
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  // Track if user is near the bottom of the chat scroll
  const isNearBottom = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Auto-scroll only when user is near bottom, or on tab switch / initial open
  const prevMessages = useRef(messages);
  useEffect(() => {
    if (open && activeTab === "chat" && scrollRef.current) {
      const el = scrollRef.current;
      const isNewMessage = messages.length !== prevMessages.current.length;
      prevMessages.current = messages;
      if (!isNewMessage || isNearBottom.current) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [messages, open, activeTab]);

  const claimAndSaveNick = useCallback(async (nick: string, flag?: string | null) => {
    if (isOffensiveNickname(nick)) { setNickError("That username is not allowed"); return false; }
    if (!isValidNickname(nick)) { setNickError("Invalid format"); return false; }

    setNickLoading(true);
    setNickError("");
    try {
      const flagToSend = flag !== undefined ? flag : selectedFlag;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim-nickname",
          nickname: nick,
          clientId: getClientId(),
          oldNickname: nicknameRef.current || undefined,
          ...(flagToSend ? { flag: flagToSend } : {}),
        }),
      });
      if (res.status === 409) { setNickError("Username is already taken"); return false; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNickError(data.error || "Failed to claim username"); return false;
      }
      nicknameRef.current = nick;
      saveNickname(nick);
      setNicknameReady(true);
      setChangingNick(false);
      return true;
    } catch {
      setNickError("Connection error");
      return false;
    } finally {
      setNickLoading(false);
    }
  }, [selectedFlag]);

  const toggleMute = useCallback((nickname: string) => {
    setMutedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(nickname)) next.delete(nickname);
      else next.add(nickname);
      saveMutedUsers(next);
      return next;
    });
    setMenuOpenId(null);
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  // Close flag dropdown on click outside
  useEffect(() => {
    if (!flagDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check both the button wrapper and the dropdown panel itself
      const panelEl = flagButtonRef.current?.closest(".fixed");
      const dropdownEl = panelEl?.querySelector("[data-flag-dropdown]");
      if (
        flagDropdownRef.current && !flagDropdownRef.current.contains(target) &&
        (!dropdownEl || !dropdownEl.contains(target))
      ) {
        setFlagDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [flagDropdownOpen]);

  const updateFlag = useCallback(async (flag: string | null) => {
    setSelectedFlag(flag);
    flagRef.current = flag;
    saveFlag(flag);
    setFlagDropdownOpen(false);
    // Persist to server
    if (nicknameRef.current) {
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-flag",
          nickname: nicknameRef.current,
          clientId: getClientId(),
          flag: flag || "",
        }),
      }).catch(() => {});
    }
  }, []);

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

  // Derive admin status from own messages
  const isAdmin = messages.some((m) => m.nickname === nicknameRef.current && m.role === "dev");

  const handlePin = useCallback(async (msg: ChatMessage) => {
    setMenuOpenId(null);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pin", message: msg }),
      });
      setPinnedMessage(msg);
    } catch {}
  }, []);

  const handleUnpin = useCallback(async () => {
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpin" }),
      });
      setPinnedMessage(null);
    } catch {}
  }, []);

  const handleLike = useCallback(async (msgId: string) => {
    if (likedIds.has(msgId)) return;
    // Optimistic update
    setLikes((prev) => ({ ...prev, [msgId]: (prev[msgId] || 0) + 1 }));
    setLikedIds((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      try { localStorage.setItem("strikemap-chat-liked", JSON.stringify([...next])); } catch {}
      return next;
    });
    setHeartAnimId(msgId);
    setTimeout(() => setHeartAnimId((prev) => (prev === msgId ? null : prev)), 600);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", messageId: msgId, clientId: getClientId() }),
      });
    } catch {}
  }, [likedIds]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    const currentReply = replyingTo;
    setReplyingTo(null);

    const currentFlag = flagRef.current;
    const optimisticMsg: ChatMessage = {
      id: `opt-${Date.now()}`,
      text,
      nickname: nicknameRef.current,
      timestamp: Date.now(),
      ...(currentFlag ? { flag: currentFlag } : {}),
      ...(currentReply ? { replyTo: currentReply } : {}),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          nickname: nicknameRef.current,
          clientId: getClientId(),
          ...(currentFlag ? { flag: currentFlag } : {}),
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

  if (!open || !mounted) return null;

  const { x, y } = pos || getDefaultPos();

  const panel = (
    <div
      className="fixed z-[60] bg-[#0a0a0a] md:bg-[#1a1a1a]/95 md:backdrop-blur-sm md:border md:border-[#2a2a2a] md:rounded-lg md:shadow-2xl"
      style={isMobile
        ? { top: "3.5rem", bottom: "3.5rem", left: 0, right: 0, overscrollBehaviorX: "none", touchAction: "pan-y pinch-zoom" }
        : { left: x, top: y, width, height }
      }
    >
    <div className="flex flex-col overflow-hidden h-full md:rounded-lg">
      {/* Header — drag handle on desktop */}
      <div
        className={`border-b border-[#2a2a2a] bg-[#0a0a0a] md:bg-transparent ${!isMobile ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={(e) => {
          if (isMobile) return;
          // Don't start drag if clicking a button
          if ((e.target as HTMLElement).closest("button")) return;
          e.preventDefault();
          onMoveStart(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (isMobile) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onMoveStart(e.touches[0].clientX, e.touches[0].clientY);
          startTouchDrag();
        }}
      >
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
            <button
              onClick={() => setActiveTab("changes")}
              className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                activeTab === "changes"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Changes
            </button>
          </div>
          <div className="flex items-center gap-2">
            {nicknameReady && !changingNick && (
              <div className="relative" ref={flagDropdownRef}>
                <button
                  ref={flagButtonRef}
                  onClick={() => setFlagDropdownOpen((v) => !v)}
                  className="text-[10px] text-neutral-600 hover:text-neutral-400 whitespace-nowrap transition-colors flex items-center gap-0.5"
                  title="Change flag or username"
                >
                  {selectedFlag && <span className="text-sm">{selectedFlag}</span>}
                  {nicknameRef.current}
                </button>
              </div>
            )}
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
      ) : activeTab === "changes" ? (
        <ChangelogPanel />
      ) : !nicknameReady || changingNick ? (
        /* Username setup screen */
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[16rem] space-y-4">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                Choose a Username
              </p>
              <p className="text-[10px] text-neutral-600">Format: 4 letters + 4 numbers</p>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <input
                type="text"
                placeholder="ABCD"
                value={nickInput.letters}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 4);
                  setNickInput((p) => ({ ...p, letters: val }));
                  setNickError("");
                  if (val.length === 4) numbersInputRef.current?.focus();
                }}
                maxLength={4}
                autoFocus
                className="w-[4.5rem] bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-2 text-sm text-neutral-200 placeholder-neutral-700 outline-none focus:border-neutral-500 text-center uppercase tracking-widest"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              />
              <span className="text-neutral-600 text-sm font-bold">-</span>
              <input
                ref={numbersInputRef}
                type="text"
                inputMode="numeric"
                placeholder="1234"
                value={nickInput.numbers}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setNickInput((p) => ({ ...p, numbers: val }));
                  setNickError("");
                }}
                maxLength={4}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nickInput.letters.length === 4 && nickInput.numbers.length === 4 && !nickLoading) {
                    const nick = `${nickInput.letters.toUpperCase()}-${nickInput.numbers}`;
                    saveFlag(selectedFlag);
                    claimAndSaveNick(nick, selectedFlag);
                  }
                }}
                className="w-[4.5rem] bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-2 text-sm text-neutral-200 placeholder-neutral-700 outline-none focus:border-neutral-500 text-center tracking-widest"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              />
            </div>
            <p className="text-red-400 text-[10px] text-center h-4">{nickError || "\u00A0"}</p>
            <div>
              <p className="text-[10px] text-neutral-500 mb-1.5 text-center">Pick your flag (optional)</p>
              <div
                className="grid grid-cols-8 gap-0.5 max-h-[160px] overflow-y-scroll touch-pan-y overscroll-contain bg-[#111] border border-[#2a2a2a] rounded-md p-1.5"
                style={{ WebkitOverflowScrolling: "touch" }}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {FLAGS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setSelectedFlag(selectedFlag === f ? null : f); flagRef.current = selectedFlag === f ? null : f; }}
                    className={`text-base p-0.5 rounded hover:bg-neutral-700/50 transition-colors ${selectedFlag === f ? "bg-neutral-700 ring-1 ring-neutral-500" : ""}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                if (nickInput.letters.length !== 4) { setNickError("Letters must be exactly 4"); return; }
                if (nickInput.numbers.length !== 4) { setNickError("Numbers must be exactly 4"); return; }
                const nick = `${nickInput.letters.toUpperCase()}-${nickInput.numbers}`;
                saveFlag(selectedFlag);
                claimAndSaveNick(nick, selectedFlag);
              }}
              disabled={nickInput.letters.length !== 4 || nickInput.numbers.length !== 4 || nickLoading}
              className="w-full py-2 text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {nickLoading ? "Checking..." : changingNick ? "Change Username" : "Join Chat"}
            </button>
            {changingNick && (
              <button
                onClick={() => { setChangingNick(false); setNickError(""); }}
                className="w-full py-1.5 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Pinned message */}
          {pinnedMessage && (
            <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <svg className="w-3 h-3 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 2H8a2 2 0 00-2 2v16l6-3 6 3V4a2 2 0 00-2-2z" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-red-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>Pinned</span>
                    <span className="text-[10px] font-semibold text-neutral-400">{pinnedMessage.nickname}</span>
                  </div>
                  <p className="text-[11px] text-red-200/80 break-words leading-relaxed">{pinnedMessage.text}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={handleUnpin}
                    className="shrink-0 text-red-400/50 hover:text-red-400 transition-colors p-0.5 mt-0.5"
                    title="Unpin"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Muted users bar */}
          {mutedUsers.size > 0 && (
            <div className="px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111] flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-neutral-600 shrink-0">Muted:</span>
              {[...mutedUsers].map((nick) => (
                <button
                  key={nick}
                  onClick={() => toggleMute(nick)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 transition-colors flex items-center gap-1"
                  title={`Unmute ${nick}`}
                >
                  {nick}
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-3 py-3 md:py-2 space-y-3 md:space-y-2">
            {messages.length === 0 && (
              <div className="text-neutral-600 text-sm md:text-xs text-center mt-8">
                No messages yet. Say something!
              </div>
            )}
            {messages.filter((msg) => !mutedUsers.has(msg.nickname)).map((msg) => {
              const isMe = msg.nickname === nicknameRef.current;
              const mentionsMe = !isMe && nicknameRef.current && msg.text.includes(`@${nicknameRef.current}`);
              const repliesToMe = !isMe && msg.replyTo?.nickname === nicknameRef.current;
              const highlightMe = mentionsMe || repliesToMe;
              const isMenuOpen = menuOpenId === msg.id;
              const likeCount = likes[msg.id] || 0;
              const showMenu = !isMe || isAdmin;
              return (
                <div
                  key={msg.id}
                  id={`chat-msg-${msg.id}`}
                  className={`group rounded px-1 -mx-1 transition-colors relative select-none ${highlightMe ? "bg-blue-500/10 border border-blue-500/20" : ""}`}
                  onDoubleClick={() => handleLike(msg.id)}
                >
                  {/* Heart animation overlay */}
                  {heartAnimId === msg.id && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <svg className="w-8 h-8 text-red-500 animate-like-heart" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    </div>
                  )}
                  {/* Reply preview */}
                  {msg.replyTo && (
                    <button
                      onClick={() => scrollToMessage(msg.replyTo!.id)}
                      className={`flex items-center gap-1.5 mb-1 pl-2 border-l-2 text-[10px] transition-colors w-full text-left ${repliesToMe ? "border-blue-500 text-blue-400 hover:text-blue-300" : "border-neutral-600 text-neutral-500 hover:text-neutral-400"}`}
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
                      {msg.flag && <span className="mr-0.5 text-sm md:text-xs">{msg.flag}</span>}
                      <span className="font-semibold text-neutral-300 text-sm md:text-xs">{msg.nickname}</span>
                      {isMe && (
                        <span className="ml-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">me</span>
                      )}
                      {msg.role === "dev" && (
                        <span className="ml-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">dev</span>
                      )}
                      <span className="text-neutral-600 text-[10px] ml-1.5">{relativeTime(msg.timestamp)}</span>
                      {likeCount > 0 && (
                        <span className="text-red-400/70 text-[10px] ml-1.5 inline-flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                          {likeCount}
                        </span>
                      )}
                      <p className="text-neutral-400 text-sm md:text-xs mt-0.5 break-words">
                        {msg.text.split(/(@[A-Za-z]{4}-\d{4})/g).map((part, i) =>
                          /^@[A-Za-z]{4}-\d{4}$/.test(part)
                            ? <span key={i} className={`font-semibold ${part.slice(1) === nicknameRef.current ? "text-blue-400" : "text-neutral-300"}`}>{part}</span>
                            : part
                        )}
                      </p>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center shrink-0 relative">
                      <button
                        onClick={() => handleReply(msg)}
                        className="md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 mt-0.5 p-1 rounded hover:bg-neutral-700/50 active:bg-neutral-700/50 text-neutral-600 hover:text-neutral-400 active:text-neutral-400 transition-all"
                        title="Reply"
                      >
                        <svg className="w-3.5 h-3.5 md:w-3 md:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M3 10l4-4m0 0l4 4m-4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {showMenu && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpenId(isMenuOpen ? null : msg.id)}
                            className="md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 mt-0.5 p-1 rounded hover:bg-neutral-700/50 active:bg-neutral-700/50 text-neutral-600 hover:text-neutral-400 active:text-neutral-400 transition-all"
                            title="More"
                          >
                            <svg className="w-3.5 h-3.5 md:w-3 md:h-3" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-0.5 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-xl py-1 min-w-[120px]"
                            >
                              {!isMe && (
                                <button
                                  onClick={() => toggleMute(msg.nickname)}
                                  className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17 14V2M9 18.12L3.95 21.04A1 1 0 012 20.18V5.82a1 1 0 01.95-.82L9 2" strokeLinecap="round" strokeLinejoin="round" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                  Mute {msg.nickname}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => handlePin(msg)}
                                  className="w-full text-left px-3 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 2H8a2 2 0 00-2 2v16l6-3 6 3V4a2 2 0 00-2-2z" />
                                  </svg>
                                  Pin message
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
              className="flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-[16px] md:text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-500"
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

      {/* Resize handle — bottom-right corner (desktop only) */}
      {!isMobile && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none group"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e.clientX, e.clientY); }}
          onTouchStart={(e) => { e.stopPropagation(); onResizeStart(e.touches[0].clientX, e.touches[0].clientY); startTouchDrag(); }}
        >
          <svg
            className="w-3 h-3 absolute bottom-0.5 right-0.5 text-neutral-600 group-hover:text-neutral-400 transition-colors"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="4" cy="8" r="1.2" />
            <circle cx="8" cy="4" r="1.2" />
          </svg>
        </div>
      )}
    </div>{/* end inner overflow-hidden wrapper */}

      {/* Flag dropdown — rendered outside overflow-hidden so it's not clipped */}
      {flagDropdownOpen && flagButtonRef.current && (() => {
        const rect = flagButtonRef.current!.getBoundingClientRect();
        const panelRect = (flagButtonRef.current!.closest(".fixed") as HTMLElement)?.getBoundingClientRect();
        const top = rect.bottom - (panelRect?.top ?? 0) + 4;
        const right = (panelRect?.right ?? 0) - rect.right;
        return (
          <div
            data-flag-dropdown
            className="absolute z-[70] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-2xl p-2 w-[220px] overflow-hidden"
            style={{ top, right: Math.max(4, right) }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5 px-0.5">Pick your flag</p>
            <div
              className="grid grid-cols-8 gap-0.5 max-h-[160px] overflow-y-auto touch-pan-y overscroll-contain mb-2"
              style={{ WebkitOverflowScrolling: "touch" }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {FLAGS.map((f) => (
                <button
                  key={f}
                  onClick={() => updateFlag(f)}
                  className={`text-base p-0.5 rounded hover:bg-neutral-700/50 transition-colors ${selectedFlag === f ? "bg-neutral-700 ring-1 ring-neutral-500" : ""}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="border-t border-[#2a2a2a] pt-1.5 flex items-center justify-between">
              {selectedFlag && (
                <button
                  onClick={() => updateFlag(null)}
                  className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Remove flag
                </button>
              )}
              <button
                onClick={() => {
                  setFlagDropdownOpen(false);
                  setChangingNick(true);
                  setNickInput({ letters: "", numbers: "" });
                  setNickError("");
                }}
                className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors ml-auto"
              >
                Change Username
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  return isMobile ? panel : createPortal(panel, document.body);
});
