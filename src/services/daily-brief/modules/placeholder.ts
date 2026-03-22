/**
 * Placeholder Module for Daily Brief
 *
 * This is a stub module showing how future modules plug into the Daily Brief system.
 * Future modules might include:
 * - Sales Pipeline: CRM deal flow and revenue projections
 * - Goal Worker Activity: Autonomous agent task completions
 * - Calendar Overview: Today's meetings and upcoming schedule
 * - Financial Summary: Budget tracking, spending patterns
 *
 * To create a new module:
 * 1. Copy this file and rename it (e.g., salesPipeline.ts)
 * 2. Implement the BriefModule interface
 * 3. Export your module
 * 4. Import and add to the modules array in ../index.ts
 */

import type { BriefModule, ModuleResult } from '../types.js';

const COLORS = {
  muted: '#6b7280',
  cardBg: '#f9fafb',
  border: '#e5e7eb',
  text: '#1f2937',
};

/**
 * Placeholder Module Implementation
 *
 * This module demonstrates the expected interface and shows users
 * that more modules are coming.
 */
export const placeholderModule: BriefModule = {
  title: 'Coming Soon',

  async render(): Promise<ModuleResult> {
    const upcomingModules = [
      {
        name: 'Sales Pipeline',
        description: 'Track deal flow, revenue projections, and CRM activity',
        icon: '💰',
      },
      {
        name: 'Goal Worker Activity',
        description: 'See what autonomous agents accomplished overnight',
        icon: '🤖',
      },
      {
        name: 'Calendar Preview',
        description: "Today's schedule and upcoming important dates",
        icon: '📅',
      },
    ];

    const moduleCards = upcomingModules
      .map(
        (mod) => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: ${COLORS.cardBg}; border-radius: 8px; border: 1px dashed ${COLORS.border};">
          <div style="font-size: 24px;">${mod.icon}</div>
          <div>
            <div style="font-weight: 600; color: ${COLORS.text}; margin-bottom: 2px;">${mod.name}</div>
            <div style="font-size: 12px; color: ${COLORS.muted};">${mod.description}</div>
          </div>
        </div>
      `
      )
      .join('');

    const html = `
      <div style="text-align: center; padding: 16px;">
        <p style="color: ${COLORS.muted}; margin: 0 0 16px 0; font-size: 14px;">
          More modules are being developed to make this brief even more useful:
        </p>
        <div style="display: flex; flex-direction: column; gap: 8px; max-width: 400px; margin: 0 auto;">
          ${moduleCards}
        </div>
      </div>
    `;

    return {
      title: 'Coming Soon',
      html,
      hasData: false, // This is intentionally false - it's a preview
    };
  },
};
