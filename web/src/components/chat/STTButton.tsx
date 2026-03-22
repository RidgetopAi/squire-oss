'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeechRecognition } from '@/lib/hooks';

interface STTButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function STTButton({ onTranscript, disabled = false }: STTButtonProps) {
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    timeoutMs: 60000,
  });

  // When we get a final transcript, send it to the parent
  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, onTranscript, resetTranscript]);

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Not supported - show disabled state
  if (!isSupported) {
    return (
      <button
        type="button"
        className="shrink-0 p-3 rounded-xl bg-background-tertiary border border-glass-border text-foreground-muted opacity-50 cursor-not-allowed"
        disabled
        title="Voice input not supported in this browser"
      >
        <MicrophoneIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`
          shrink-0 p-3 rounded-xl transition-colors
          ${isListening
            ? 'bg-accent text-background border border-accent glow-accent'
            : 'bg-background-tertiary border border-glass-border text-foreground-muted hover:text-foreground hover:border-primary/50'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title={isListening ? 'Stop listening' : 'Voice input'}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div
              key="listening"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="relative"
            >
              {/* Pulsing ring animation */}
              <motion.div
                className="absolute inset-0 rounded-full bg-accent/30"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <StopIcon className="w-5 h-5 relative z-10" />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <MicrophoneIcon className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Interim transcript tooltip */}
      <AnimatePresence>
        {isListening && interimTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-background-tertiary border border-glass-border text-sm text-foreground-muted whitespace-nowrap max-w-xs truncate"
          >
            {interimTranscript}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error tooltip */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-error/20 border border-error/50 text-sm text-error whitespace-nowrap"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Icon components
function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
