'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocumentDiscussion } from '@/lib/hooks/useDocumentDiscussion';
import { getFileTypeLabel, formatFileSize, type StoredDocument } from '@/lib/api/documents';

interface DocumentDiscussionViewProps {
  document: StoredDocument;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'doc' | 'chat';

export function DocumentDiscussionView({ document, isOpen, onClose }: DocumentDiscussionViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('doc');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const docScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isLoading, isStreaming, error, sendMessage } = useDocumentDiscussion(
    isOpen ? document : null
  );

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Track scroll progress on doc tab
  const handleDocScroll = useCallback(() => {
    const el = docScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setScrollProgress(max > 0 ? scrollTop / max : 0);
  }, []);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  // Focus chat input when switching to chat tab
  useEffect(() => {
    if (activeTab === 'chat') {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [activeTab]);

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (trimmed && !isLoading && !isStreaming) {
      sendMessage(trimmed);
      setChatInput('');
      if (chatInputRef.current) {
        chatInputRef.current.style.height = 'auto';
      }
    }
  };

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isStreaming) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  // Auto-resize chat textarea
  useEffect(() => {
    const textarea = chatInputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.25;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [chatInput]);

  const canSend = chatInput.trim().length > 0 && !isLoading && !isStreaming;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[60] bg-[var(--background)] flex flex-col pt-[env(safe-area-inset-top)]"
        >
          {/* Scroll progress bar (doc tab only) */}
          {activeTab === 'doc' && (
            <div className="h-0.5 bg-background-tertiary">
              <div
                className="h-full bg-primary transition-all duration-100"
                style={{ width: `${scrollProgress * 100}%` }}
              />
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
            {/* Document info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{document.name}</p>
              <p className="text-xs text-foreground-muted">
                {getFileTypeLabel(document.mime_type)} · {formatFileSize(document.size_bytes)}
              </p>
            </div>

            {/* Tab toggle */}
            <div className="flex rounded-lg bg-background-tertiary p-0.5 shrink-0">
              <button
                onClick={() => setActiveTab('doc')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'doc'
                    ? 'bg-primary text-white'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                Doc
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-primary text-white'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                Chat
              </button>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors shrink-0"
            >
              <svg className="w-5 h-5 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content area */}
          {activeTab === 'doc' ? (
            /* === DOCUMENT TAB === */
            <div
              ref={docScrollRef}
              onScroll={handleDocScroll}
              className="flex-1 overflow-y-auto"
            >
              <div className="max-w-2xl mx-auto px-6 py-8">
                {document.extracted_text ? (
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-[var(--font-jakarta)] leading-relaxed">
                    {document.extracted_text}
                  </pre>
                ) : (
                  <p className="text-sm text-foreground-muted text-center py-12">
                    No text content available for this document.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* === CHAT TAB === */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
                  {/* Initial prompt */}
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-foreground-muted">
                        Ask anything about <span className="text-primary">{document.name}</span>
                      </p>
                      <p className="text-xs text-foreground-muted/60 mt-1">
                        The full document has been loaded for discussion.
                      </p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                          msg.role === 'user'
                            ? 'bg-primary text-white'
                            : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          msg.content ? (
                            <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_pre]:text-xs [&_blockquote]:border-primary/30 [&_blockquote]:text-foreground-muted">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 py-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-pulse" />
                              <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-pulse" style={{ animationDelay: '0.15s' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-pulse" style={{ animationDelay: '0.3s' }} />
                            </div>
                          )
                        ) : (
                          <p className="text-sm">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {error && (
                    <div className="text-center">
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input */}
              <div className="border-t border-[var(--card-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="max-w-2xl mx-auto flex items-end gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Ask about this document..."
                    rows={1}
                    className="flex-1 px-4 py-2.5 resize-none bg-background-tertiary border border-glass-border rounded-xl text-foreground placeholder-foreground-muted text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/30 focus:outline-none transition-colors"
                    style={{ maxHeight: '25vh' }}
                  />
                  <button
                    type="button"
                    onClick={handleChatSubmit}
                    disabled={!canSend}
                    className={`shrink-0 p-2.5 rounded-xl transition-all duration-200 ${
                      canSend
                        ? 'bg-primary text-[var(--background)] hover:bg-primary-hover'
                        : 'text-foreground-muted'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isLoading || isStreaming ? (
                      <span className="w-5 h-5 flex items-center justify-center">
                        <span className="w-3 h-3 rounded-sm bg-current animate-pulse" />
                      </span>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
