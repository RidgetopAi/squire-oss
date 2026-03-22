'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReportReader } from './ReportReader';
import type { SavedCard as SavedCardType } from '@/lib/stores/savedCardsStore';

interface SavedCardProps {
  card: SavedCardType;
  onUnsave: (id: string) => void;
}

export function SavedCard({ card, onUnsave }: SavedCardProps) {
  const [showContext, setShowContext] = useState(false);
  const [isReaderOpen, setIsReaderOpen] = useState(false);

  const hasReport = !!card.reportData;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-l border-[var(--card-border)] bg-[var(--card-bg)] card-glow"
      >
        {/* Content: report card or regular assistant response */}
        {hasReport ? (
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-accent-mustard/15 text-accent-mustard border border-accent-mustard/30">
                Report
              </span>
            </div>
            <h3 className="font-[var(--font-instrument)] text-lg text-foreground font-normal mb-1">
              {card.reportData!.title}
            </h3>
            <p className="text-sm text-foreground-muted leading-relaxed mb-3">
              {card.reportData!.summary}
            </p>
            <button
              onClick={() => setIsReaderOpen(true)}
              className="text-sm text-primary hover:text-primary-hover transition-colors font-medium"
            >
              Read Full Report →
            </button>
          </div>
        ) : (
          <div className="px-5 pt-4 pb-3">
            <div className="prose prose-invert prose-sm max-w-none text-foreground leading-relaxed
              [&_p]:mb-2 [&_p:last-child]:mb-0
              [&_code]:text-accent-mustard [&_code]:bg-background-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
              [&_pre]:bg-background-tertiary [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-xs
              [&_a]:text-primary [&_a]:underline
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_table]:w-full [&_table]:text-sm [&_table]:my-3
              [&_thead]:border-b [&_thead]:border-foreground-muted/20
              [&_th]:text-left [&_th]:text-foreground-muted [&_th]:font-medium [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:px-3 [&_th]:py-2
              [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-[var(--card-border)] [&_td]:text-foreground
              [&_tr:last-child_td]:border-b-0
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.assistantContent}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Tags + actions */}
        <div className="px-5 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 bg-accent-olive/15 text-accent-olive border border-accent-olive/30"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Expand context */}
            {card.userMessage && (
              <button
                onClick={() => setShowContext(!showContext)}
                className="text-[10px] text-foreground-muted hover:text-foreground transition-colors"
              >
                {showContext ? 'Hide' : 'Context'}
              </button>
            )}

            {/* Unsave */}
            <button
              onClick={() => onUnsave(card.id)}
              className="text-foreground-muted hover:text-error transition-colors p-1"
              title="Remove from saved"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expandable context */}
        <AnimatePresence>
          {showContext && card.userMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4 pt-2 border-t border-[var(--card-border)]">
                <p className="text-[10px] text-foreground-muted/50 uppercase tracking-wider mb-1 font-medium">
                  Conversation context
                </p>
                <p className="text-sm text-foreground-muted/60 leading-relaxed">
                  {card.userMessage}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Report reader overlay */}
      {hasReport && (
        <ReportReader
          report={card.reportData!}
          isOpen={isReaderOpen}
          onClose={() => setIsReaderOpen(false)}
        />
      )}
    </>
  );
}
