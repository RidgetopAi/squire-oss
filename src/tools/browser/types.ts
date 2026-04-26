/**
 * Browser Tools Types
 *
 * Type definitions for browser automation via playwright-cli.
 */

// === NAVIGATE ===

export interface BrowserNavigateArgs {
  /** URL to navigate to */
  url: string;
}

// === SNAPSHOT ===

export interface BrowserSnapshotArgs {
  /** Optional element ref to snapshot (defaults to full page) */
  ref?: string;
}

// === CLICK ===

export interface BrowserClickArgs {
  /** Element ref from snapshot (e.g., "e38") */
  ref: string;
}

// === FILL ===

export interface BrowserFillArgs {
  /** Element ref from snapshot (e.g., "e38") */
  ref: string;
  /** Text to fill into the element */
  text: string;
}

// === SCREENSHOT ===

export interface BrowserScreenshotArgs {
  /** Optional element ref to screenshot (defaults to viewport) */
  ref?: string;
}

// === PRESS ===

export interface BrowserPressArgs {
  /** Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown") */
  key: string;
}
