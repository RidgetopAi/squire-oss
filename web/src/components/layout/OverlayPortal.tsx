'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface OverlayPortalProps {
  children: ReactNode;
  containerId?: string;
}

/**
 * Portal component for rendering overlays at the document root
 * Ensures overlays appear above all other content
 */
export function OverlayPortal({
  children,
  containerId = 'overlay-root',
}: OverlayPortalProps) {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);

    // Get or create container
    let element = document.getElementById(containerId);
    if (!element) {
      element = document.createElement('div');
      element.id = containerId;
      element.className = 'fixed inset-0 pointer-events-none z-50';
      document.body.appendChild(element);
    }
    setContainer(element);

    return () => {
      // Don't remove the container on unmount as other portals might use it
    };
  }, [containerId]);

  if (!mounted || !container) {
    return null;
  }

  return createPortal(children, container);
}

export default OverlayPortal;
