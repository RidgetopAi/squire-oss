/**
 * Report Tool
 *
 * Allows the LLM to present structured reports with a title,
 * summary, and full markdown content. The frontend renders
 * these as special report cards with a full-screen reader.
 */

import type { ToolHandler, ToolSpec } from './types.js';

interface PresentReportArgs {
  title: string;
  summary: string;
  content: string;
}

function presentReport(args: PresentReportArgs): string {
  const { title, summary, content } = args;

  if (!title || !summary || !content) {
    return 'Error: title, summary, and content are all required.';
  }

  // Return structured JSON — the socket handler will parse this
  // and attach it as reportData to the chat:done payload
  return JSON.stringify({
    type: 'report',
    title,
    summary,
    content,
    generatedAt: new Date().toISOString(),
  });
}

export const tools: ToolSpec[] = [{
  name: 'present_report',
  description: 'Present a structured report to the user with a title, summary, and full content. Use this when the user asks for a report, analysis, deep dive, comprehensive overview, or research summary. The report will be displayed as a special card with a full-screen reader.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Report title (clear, descriptive)',
      },
      summary: {
        type: 'string',
        description: 'A 2-3 sentence summary of the report findings',
      },
      content: {
        type: 'string',
        description: 'Full report content in markdown format. Use headers, lists, bold, and other formatting for readability.',
      },
    },
    required: ['title', 'summary', 'content'],
  },
  handler: presentReport as ToolHandler,
}];
