/**
 * Browser Tools
 *
 * Browser automation via playwright-cli.
 * Provides navigate, snapshot, click, fill, screenshot,
 * press, close, console, and network tools.
 */

import { tools as navigateTools } from './navigate.js';
import { tools as snapshotTools } from './snapshot.js';
import { tools as clickTools } from './click.js';
import { tools as fillTools } from './fill.js';
import { tools as screenshotTools } from './screenshot.js';
import { tools as pressTools } from './press.js';
import { tools as closeTools } from './close.js';
import { tools as consoleTools } from './console.js';
import { tools as networkTools } from './network.js';

import type { ToolSpec } from '../types.js';

export const tools: ToolSpec[] = [
  ...navigateTools,
  ...snapshotTools,
  ...clickTools,
  ...fillTools,
  ...screenshotTools,
  ...pressTools,
  ...closeTools,
  ...consoleTools,
  ...networkTools,
];
