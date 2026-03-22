'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * ✨ EDIT THIS LIST to add/remove/change loading phrases ✨
 */
const LOADING_PHRASES = [
  'Migrating Coconuts',
  'Hee Hawing',
  "Put'em in the Bucket",
  'Hobnobbing',
  'Spindeling',
];

/** Duration each phrase is displayed (ms) */
const PHRASE_DURATION = 2400;
/** Stagger delay between each letter starting its shimmer (ms) */
const LETTER_STAGGER = 45;

const SHIMMER_CSS = `
@keyframes squire-shimmer-sweep {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

export function LoadingWordRotator() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_PHRASES.length));
  const [visible, setVisible] = useState(true);
  const styleInjected = useRef(false);

  // Inject keyframe CSS once
  useEffect(() => {
    if (styleInjected.current) return;
    styleInjected.current = true;
    const style = document.createElement('style');
    style.textContent = SHIMMER_CSS;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
      styleInjected.current = false;
    };
  }, []);

  // Rotate phrases
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
        setVisible(true);
      }, 350);
    }, PHRASE_DURATION);

    return () => clearInterval(interval);
  }, []);

  const phrase = LOADING_PHRASES[index];

  const letterStyle = (i: number): React.CSSProperties => ({
    display: 'inline-block',
    background: `linear-gradient(
      90deg,
      var(--foreground-muted) 0%,
      var(--foreground-muted) 35%,
      var(--primary) 48%,
      var(--accent-mustard) 52%,
      var(--foreground-muted) 65%,
      var(--foreground-muted) 100%
    )`,
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: `squire-shimmer-sweep 2s ease-in-out infinite`,
    animationDelay: `${i * LETTER_STAGGER}ms`,
  });

  return (
    <div className="flex items-center gap-2 select-none" aria-live="polite" aria-label="Loading">
      {/* Small pulsing dot */}
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
        style={{ boxShadow: '0 0 6px var(--primary-glow)' }}
      />

      {/* Rotating phrase with per-letter shimmer */}
      <span
        className="text-base font-bold tracking-wide"
        style={{
          transition: 'opacity 300ms ease-in-out, transform 300ms ease-in-out',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-4px)',
        }}
      >
        {phrase.split('').map((char, i) => (
          <span key={`${index}-${i}`} style={letterStyle(i)}>
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
    </div>
  );
}
