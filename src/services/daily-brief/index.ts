/**
 * Daily Brief Orchestrator
 *
 * Runs all brief modules, assembles the final HTML email, and sends it.
 * This is Module 1 of a growing Daily Brief system.
 *
 * Usage:
 *   import { generateAndSendDailyBrief } from './services/daily-brief';
 *   await generateAndSendDailyBrief();
 */

import type { BriefModule, ModuleResult } from './types.js';
import { memoryHealthModule } from './modules/memoryHealth.js';
import { placeholderModule } from './modules/placeholder.js';
import { sendDailyBrief, getPrimaryAccount } from './emailer.js';

// Color palette (matches modules)
const COLORS = {
  headerBg: '#1a1a2e',
  accent: '#4f8ef7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#1f2937',
  muted: '#6b7280',
  cardBg: '#f9fafb',
  white: '#ffffff',
  border: '#e5e7eb',
};

/**
 * All registered modules in display order.
 * Add new modules here as they're built.
 */
const modules: BriefModule[] = [
  memoryHealthModule,
  // Future modules will be added here:
  // salesPipelineModule,
  // goalWorkerActivityModule,
  // calendarPreviewModule,
  placeholderModule, // Shows what's coming - remove when more modules exist
];

/**
 * Format the current date for display
 */
function formatDateHeader(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time for footer
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Get a contextual tagline based on the day
 */
function getTagline(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();

  const taglines: Record<number, string> = {
    0: "Sunday briefing — let's see where things stand",
    1: "Starting the week strong — here's your Monday overview",
    2: 'Tuesday update — keeping you in sync',
    3: 'Midweek check-in — Wednesday at a glance',
    4: 'Thursday brief — almost there',
    5: 'Friday summary — wrapping up the week',
    6: 'Saturday review — a moment to reflect',
  };

  return taglines[dayOfWeek] || "Your daily briefing from Squire";
}

/**
 * Render the alerts bar (urgent items from all modules)
 */
function renderAlertsBar(allAlerts: string[]): string {
  if (allAlerts.length === 0) return '';

  const alertItems = allAlerts
    .map(
      (alert) => `
      <div style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 0;">
        <span style="color: ${COLORS.warning}; font-size: 16px;">⚠</span>
        <span style="color: ${COLORS.text}; font-size: 14px;">${alert}</span>
      </div>
    `
    )
    .join('');

  return `
    <div style="background: ${COLORS.warning}10; border: 1px solid ${COLORS.warning}30; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
      <div style="font-weight: 600; color: ${COLORS.warning}; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Attention Needed
      </div>
      ${alertItems}
    </div>
  `;
}

/**
 * Render a module section with consistent styling
 */
function renderModuleSection(result: ModuleResult): string {
  return `
    <div style="margin-bottom: 32px;">
      ${result.html}
    </div>
  `;
}

/**
 * Build the full HTML email document
 */
function buildEmailHtml(moduleResults: ModuleResult[]): string {
  // Collect all alerts
  const allAlerts = moduleResults.flatMap((r) => r.alerts || []);

  // Render module sections (only include those with data or placeholders)
  const moduleSections = moduleResults.map(renderModuleSection).join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Squire Daily Brief</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: ${COLORS.text}; background: ${COLORS.cardBg};">
  <div style="max-width: 680px; margin: 0 auto; background: ${COLORS.white};">

    <!-- Header -->
    <div style="background: ${COLORS.headerBg}; padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 600; color: ${COLORS.white};">
        Squire Daily Brief
      </h1>
      <div style="font-size: 16px; color: ${COLORS.accent}; margin-bottom: 4px;">
        ${formatDateHeader()}
      </div>
      <div style="font-size: 14px; color: ${COLORS.muted}; font-style: italic;">
        ${getTagline()}
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 24px;">
      ${renderAlertsBar(allAlerts)}
      ${moduleSections}
    </div>

    <!-- Footer -->
    <div style="background: ${COLORS.cardBg}; padding: 16px 24px; text-align: center; border-top: 1px solid ${COLORS.border};">
      <div style="font-size: 12px; color: ${COLORS.muted};">
        Generated by Squire &bull; ${formatTimestamp()}
      </div>
      <div style="font-size: 11px; color: ${COLORS.muted}; margin-top: 4px;">
        Your personal AI assistant
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();

  return html;
}

/**
 * Generate the complete daily brief HTML without sending
 *
 * Useful for previewing or testing
 */
export async function generateDailyBrief(): Promise<{
  subject: string;
  html: string;
  moduleCount: number;
  hasData: boolean;
  alerts: string[];
}> {
  console.log('[DailyBrief] Generating daily brief...');

  // Run all modules
  const results: ModuleResult[] = [];
  for (const module of modules) {
    try {
      console.log(`[DailyBrief] Running module: ${module.title}`);
      const result = await module.render();
      results.push(result);
      console.log(`[DailyBrief] Module ${module.title}: hasData=${result.hasData}, alerts=${result.alerts?.length || 0}`);
    } catch (error) {
      console.error(`[DailyBrief] Error in module ${module.title}:`, error);
      results.push({
        title: module.title,
        html: `<div style="color: ${COLORS.danger};">Error loading ${module.title}</div>`,
        hasData: false,
        alerts: [`Failed to load ${module.title}`],
      });
    }
  }

  // Build the email
  const html = buildEmailHtml(results);
  const subject = `Squire Daily Brief — ${formatDateHeader()}`;
  const allAlerts = results.flatMap((r) => r.alerts || []);
  const hasData = results.some((r) => r.hasData);

  console.log(`[DailyBrief] Brief generated: ${results.length} modules, ${allAlerts.length} alerts`);

  return {
    subject,
    html,
    moduleCount: results.length,
    hasData,
    alerts: allAlerts,
  };
}

/**
 * Generate and send the daily brief email
 *
 * This is the main entry point called by the courier task.
 */
export async function generateAndSendDailyBrief(): Promise<{
  success: boolean;
  message: string;
  recipient?: string;
}> {
  try {
    // Check if we have a Google account configured
    const account = await getPrimaryAccount();
    if (!account) {
      return {
        success: false,
        message: 'No Google account configured - cannot send daily brief',
      };
    }

    // Generate the brief
    const brief = await generateDailyBrief();

    // Send it
    const sent = await sendDailyBrief(brief.subject, brief.html);

    if (sent) {
      return {
        success: true,
        message: `Daily brief sent with ${brief.moduleCount} modules (${brief.alerts.length} alerts)`,
        recipient: account.email,
      };
    } else {
      return {
        success: false,
        message: 'Failed to send daily brief email',
      };
    }
  } catch (error) {
    console.error('[DailyBrief] Error generating/sending brief:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Re-export types for convenience
export type { BriefModule, ModuleResult } from './types.js';
