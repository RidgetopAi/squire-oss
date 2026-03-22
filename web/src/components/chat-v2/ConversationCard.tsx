'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ConversationPair } from '@/lib/types';
import { ReportReader } from './ReportReader';

interface ConversationCardProps {
  pair: ConversationPair;
  index: number;
  onBookmark?: (pair: ConversationPair) => void;
  isBookmarked?: boolean;
}

export function ConversationCard({ pair, index, onBookmark, isBookmarked = false }: ConversationCardProps) {
  const { userMessage, assistantMessage, isStreaming } = pair;
  const [isHovered, setIsHovered] = useState(false);
  const [isReaderOpen, setIsReaderOpen] = useState(false);

  const hasReport = assistantMessage?.reportData;

  const handleOpenReader = useCallback(() => {
    setIsReaderOpen(true);
  }, []);

  const handleCloseReader = useCallback(() => {
    setIsReaderOpen(false);
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
        className="relative border-l border-[var(--card-border)] bg-[var(--card-bg)] card-glow"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Bookmark button */}
        {(isHovered || isBookmarked) && !isStreaming && assistantMessage && (
          <button
            onClick={() => onBookmark?.(pair)}
            className={`absolute top-3 right-3 z-10 p-1.5 transition-all ${
              isBookmarked
                ? 'text-accent-mustard'
                : 'text-foreground-muted hover:text-accent-mustard'
            }`}
            title={isBookmarked ? 'Saved' : 'Save this card'}
          >
            <svg className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        )}

        {/* User message section */}
        {(userMessage.content || (userMessage.images && userMessage.images.length > 0)) && (
          <div className="px-5 pt-4 pb-2">
            {userMessage.images && userMessage.images.length > 0 && (
              <div className={`flex gap-2 flex-wrap${userMessage.content ? ' mb-2' : ''}`}>
                {userMessage.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.preview}
                    alt={img.name}
                    className="w-20 h-20 object-cover rounded border border-[var(--card-border)]"
                  />
                ))}
              </div>
            )}
            {userMessage.content && (
              <p className="text-sm text-foreground-muted/60 leading-relaxed">
                {userMessage.content}
              </p>
            )}
          </div>
        )}

        {/* Divider */}
        {(userMessage.content || (userMessage.images && userMessage.images.length > 0)) && (assistantMessage || isStreaming) && (
          <div className="mx-5 border-t border-[var(--card-border)]" />
        )}

        {/* Assistant response section */}
        {hasReport ? (
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-accent-mustard/15 text-accent-mustard border border-accent-mustard/30">
                Report
              </span>
            </div>
            <h3 className="font-[var(--font-instrument)] text-lg text-foreground font-normal mb-1">
              {assistantMessage!.reportData!.title}
            </h3>
            <p className="text-sm text-foreground-muted leading-relaxed mb-3">
              {assistantMessage!.reportData!.summary}
            </p>
            <button
              onClick={handleOpenReader}
              className="text-sm text-primary hover:text-primary-hover transition-colors font-medium"
            >
              Read Full Report →
            </button>
          </div>
        ) : assistantMessage ? (
          <div className="px-5 pt-3 pb-4">
            <div className="prose prose-invert prose-sm max-w-none text-foreground leading-relaxed
              [&_p]:mb-2 [&_p:last-child]:mb-0
              [&_code]:text-accent-mustard [&_code]:bg-background-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
              [&_pre]:bg-background-tertiary [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-xs
              [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
              [&_li]:mb-1
              [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
              [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
              [&_blockquote]:border-l-2 [&_blockquote]:border-cream/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-foreground-muted
              [&_table]:w-full [&_table]:text-sm [&_table]:my-3
              [&_thead]:border-b [&_thead]:border-foreground-muted/20
              [&_th]:text-left [&_th]:text-foreground-muted [&_th]:font-medium [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:px-3 [&_th]:py-2
              [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-[var(--card-border)] [&_td]:text-foreground
              [&_tr:last-child_td]:border-b-0
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantMessage.content}</ReactMarkdown>
            </div>
          </div>
        ) : isStreaming ? (
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : null}
      </motion.div>

      {/* Report reader overlay */}
      {hasReport && (
        <ReportReader
          report={assistantMessage!.reportData!}
          isOpen={isReaderOpen}
          onClose={handleCloseReader}
        />
      )}
    </>
  );
}
