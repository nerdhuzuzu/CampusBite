import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  X,
  MessageSquare,
  Plus,
  Store,
  User,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { Badge, Button, Input } from '@/components/ui';
import { formatPrice, formatTime } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface RecommendedDish {
  id: string;
  name: string;
  price: number;
  outlet: string;
  protein?: number;
  menuItem?: MenuItem;
}

interface OutletCardInfo {
  name: string;
  isOpen: boolean;
  hours: string;
  estimatedWaitMinutes: number;
  crowdLevel: string;
  availableDishes: number;
}

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  feedback?: 'HELPFUL' | 'NOT_HELPFUL';
  isError?: boolean;
  recommendedItems?: RecommendedDish[];
  outletCards?: OutletCardInfo[];
}

function FormattedMarkdown({ text }: { text: string }) {
  // Split fenced code blocks first
  const segments = text.split(/(```[\s\S]*?```)/g);

  const renderInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={i} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="rounded bg-slate-200/80 px-1 py-0.5 font-mono text-[11px] dark:bg-slate-700"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-1.5 leading-relaxed">
      {segments.map((seg, idx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const code = seg.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
          return (
            <pre
              key={idx}
              className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-100"
            >
              <code>{code}</code>
            </pre>
          );
        }

        const lines = seg.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              if (trimmed.startsWith('### ')) {
                return (
                  <h4
                    key={lIdx}
                    className="pt-1 text-xs font-extrabold uppercase tracking-wider text-brand-700 dark:text-accent-400"
                  >
                    {trimmed.slice(4)}
                  </h4>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-1">
                    <span className="text-accent-500">•</span>
                    <span className="flex-1">{renderInline(trimmed.slice(2))}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function ChatPanel({ className = 'h-[580px]' }: { className?: string }) {
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const starterQuestions =
    user?.role === 'MANAGER'
      ? [
          'Show my active kitchen orders',
          'Which ingredients are low on stock?',
          'What is my outlet sales summary today?',
          'Which outlet has the shortest queue?',
        ]
      : user?.role === 'SUPER_ADMIN'
        ? [
            'Show platform revenue overview',
            'Which outlet has the highest orders?',
            'Which outlet is less crowded right now?',
            'Show popular campus dishes',
          ]
        : [
            'What should I eat today?',
            'Show me food under ₹60',
            'Which outlet has the cheapest sandwich?',
            'Recommend high-protein food',
            'Which outlet is less crowded?',
            'Where is my current order?',
          ];

  // Load persistent conversation history from MySQL on mount
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        const res = await api.get('/ai/conversations');
        if (!active) return;
        const data = res.data.data;
        setConversationId(data.conversationId);
        const loaded: ChatItem[] = (data.messages ?? []).map(
          (m: {
            id: string;
            role: 'user' | 'assistant';
            content: string;
            createdAt: string;
            metadata?: {
              feedback?: 'HELPFUL' | 'NOT_HELPFUL';
              recommendedItems?: RecommendedDish[];
              outletCards?: OutletCardInfo[];
            };
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            feedback: m.metadata?.feedback,
            recommendedItems: m.metadata?.recommendedItems,
            outletCards: m.metadata?.outletCards,
          })
        );

        if (loaded.length > 0) {
          setMessages(loaded);
        } else {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content:
                user?.role === 'MANAGER'
                  ? '### Kitchen Operations AI\nAsk me about your **active kitchen orders**, **low-stock ingredients**, **daily revenue**, or **outlet queue times**.'
                  : user?.role === 'SUPER_ADMIN'
                    ? '### Super Admin Intelligence\nAsk me about **campus-wide revenue**, **outlet order volume**, **crowd telemetry**, or **top dishes**.'
                    : '### CampusBite AI Food Assistant\nAsk me about **live dish prices**, **meals under your budget**, **high-protein options**, **wait times**, or **your order status**!',
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        // Fallback welcome if unauthenticated
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    setLastFailedPrompt(null);
    const userEntry: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userEntry]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/chat', {
        message: trimmed,
        conversationId: conversationId ?? undefined,
      });
      const d = res.data.data;
      if (d.conversationId) setConversationId(d.conversationId);

      const botEntry: ChatItem = {
        id: d.messageId ?? `a-${Date.now()}`,
        role: 'assistant',
        content: d.response,
        createdAt: d.createdAt ?? new Date().toISOString(),
        recommendedItems: d.recommendedItems,
        outletCards: d.outletCards,
      };
      setMessages((prev) => [...prev, botEntry]);
    } catch {
      setLastFailedPrompt(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'Could not reach the AI assistant right now. Click **Retry** below to resend your question.',
          createdAt: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await api.delete('/ai/conversations');
      setConversationId(null);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content:
            'Conversation history cleared. How can I help you with live campus dining data today?',
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success('Chat history cleared');
    } catch {
      toast.error('Could not clear chat history');
    }
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error('Could not copy message');
    }
  };

  const handleFeedback = async (messageId: string, helpful: boolean) => {
    if (messageId.startsWith('welcome') || messageId.startsWith('err-')) return;
    try {
      await api.post('/ai/chat/feedback', { messageId, helpful });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, feedback: helpful ? 'HELPFUL' : 'NOT_HELPFUL' }
            : m
        )
      );
      toast.success(helpful ? 'Marked as helpful!' : 'Feedback recorded');
    } catch {
      toast.error('Could not save feedback');
    }
  };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-brand-800 via-brand-700 to-slate-900 px-4 py-3 text-white dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <Bot className="h-5 w-5 text-accent-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold">CampusBite AI</h3>
              <Badge tone="success">Live DB</Badge>
            </div>
            <p className="text-[11px] text-white/75">
              Role-aware ({user?.role ?? 'STUDENT'}) • Persistent Memory
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          title="Clear conversation history"
          aria-label="Clear conversation history"
          className="rounded-lg p-1.5 text-white/75 hover:bg-white/15 hover:text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Starter Prompt Chips */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
        {starterQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void sendMessage(q)}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-accent-500 hover:text-accent-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages Stream */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2.5 ${
              m.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                m.role === 'user'
                  ? 'bg-accent-500 text-white'
                  : 'bg-brand-700 text-white'
              }`}
            >
              {m.role === 'user' ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </div>

            <div
              className={`max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2.5 text-xs ${
                m.role === 'user'
                  ? 'bg-accent-500 text-white'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              <FormattedMarkdown text={m.content} />

              {/* Interactive Dish Cards inside Chat */}
              {m.recommendedItems &&
                m.recommendedItems.length > 0 &&
                user?.role === 'STUDENT' && (
                  <div className="space-y-1.5 pt-1.5">
                    {m.recommendedItems.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2 text-[11px] text-slate-800 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {item.outlet} • {formatPrice(item.price)}
                          </p>
                        </div>
                        {item.menuItem && (
                          <button
                            type="button"
                            onClick={() => {
                              addItem(item.menuItem!);
                              toast.success(`Added ${item.name} to tray`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-accent-600"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Outlet Queue Cards inside Chat */}
              {m.outletCards && m.outletCards.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {m.outletCards.map((oc) => (
                    <div
                      key={oc.name}
                      className="flex items-center justify-between rounded-xl bg-white p-2 text-[11px] text-slate-800 shadow-xs dark:bg-slate-900 dark:text-slate-200"
                    >
                      <span className="font-bold">
                        <Store className="mr-1 inline h-3 w-3 text-accent-500" />
                        {oc.name}
                      </span>
                      <span>
                        {oc.crowdLevel} • ~{oc.estimatedWaitMinutes}m wait
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Retry Action on Error */}
              {m.isError && lastFailedPrompt && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => void sendMessage(lastFailedPrompt)}
                >
                  Retry Last Question
                </Button>
              )}

              {/* Timestamp, Copy & Feedback Toolbar */}
              <div
                className={`flex items-center justify-between gap-3 pt-1 text-[10px] ${
                  m.role === 'user' ? 'text-white/75' : 'text-slate-400'
                }`}
              >
                <span>{formatTime(m.createdAt)}</span>
                {m.role === 'assistant' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopy(m.id, m.content)}
                      title="Copy response"
                      aria-label="Copy response"
                      className="rounded p-0.5 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {copiedId === m.id ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    {!m.id.startsWith('welcome') && !m.isError && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleFeedback(m.id, true)}
                          title="Helpful response"
                          aria-label="Helpful response"
                          className={`rounded p-0.5 ${
                            m.feedback === 'HELPFUL'
                              ? 'text-emerald-600'
                              : 'hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleFeedback(m.id, false)}
                          title="Not helpful"
                          aria-label="Not helpful"
                          className={`rounded p-0.5 ${
                            m.feedback === 'NOT_HELPFUL'
                              ? 'text-red-500'
                              : 'hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 animate-spin text-accent-500" />
            <span>Querying live MySQL records…</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask CampusBite AI about menus, orders, stock, or analytics…"
        />
        <Button type="submit" variant="accent" disabled={isTyping}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function FloatingChatbot() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-5 z-40 md:bottom-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="mb-3 w-[calc(100vw-2.5rem)] max-w-sm sm:max-w-md"
          >
            <ChatPanel className="h-[520px]" />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        className="ml-auto flex h-13 items-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-accent-500 px-4 text-sm font-bold text-white shadow-lift transition hover:scale-105 active:scale-95"
      >
        {open ? (
          <>
            <X className="h-5 w-5" />
            <span>Close AI</span>
          </>
        ) : (
          <>
            <MessageSquare className="h-5 w-5" />
            <span>CampusBite AI</span>
          </>
        )}
      </button>
    </div>
  );
}

export default FloatingChatbot;
