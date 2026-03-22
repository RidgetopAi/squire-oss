// ============================================
// SQUIRE WEB - EXPORT UTILITIES
// ============================================
// Functions for exporting memories to various formats

import type { ScoredMemory, EntitySummary } from '@/lib/types';
import { formatDateTime } from './formatting';

// === Single Memory Export ===

/**
 * Export a single memory to Markdown format
 */
function memoryToMarkdown(
  memory: ScoredMemory,
  entities?: EntitySummary[]
): string {
  const lines: string[] = [];

  lines.push('# Memory');
  lines.push('');
  lines.push(`**Date**: ${formatDateTime(memory.created_at)}`);
  lines.push(`**Salience**: ${memory.salience_score.toFixed(1)}/10`);
  lines.push(`**Category**: ${memory.category.replace('_', ' ')}`);
  lines.push('');
  lines.push('## Content');
  lines.push('');
  lines.push(memory.content);
  lines.push('');

  if (entities && entities.length > 0) {
    lines.push('## Entities');
    lines.push('');
    entities.forEach((e) => {
      lines.push(`- **${e.name}** (${e.type}) - ${e.mention_count} mentions`);
    });
    lines.push('');
  }

  lines.push('## Scores');
  lines.push('');
  lines.push(`- Salience: ${memory.salience_score.toFixed(2)}`);
  lines.push(`- Strength: ${(memory.current_strength * 100).toFixed(0)}%`);
  lines.push(`- Recency: ${(memory.recency_score * 100).toFixed(0)}%`);
  if (memory.similarity !== undefined) {
    lines.push(`- Similarity: ${(memory.similarity * 100).toFixed(0)}%`);
  }
  lines.push(`- Final Score: ${(memory.final_score * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('---');
  lines.push(`*Exported from Squire on ${formatDateTime(new Date().toISOString())}*`);

  return lines.join('\n');
}

/**
 * Export a single memory to plain text format
 */
function memoryToText(memory: ScoredMemory): string {
  const lines: string[] = [];

  lines.push('MEMORY');
  lines.push('======');
  lines.push('');
  lines.push(`Date: ${formatDateTime(memory.created_at)}`);
  lines.push(`Salience: ${memory.salience_score.toFixed(1)}/10`);
  lines.push('');
  lines.push('CONTENT');
  lines.push('-------');
  lines.push(memory.content);
  lines.push('');
  lines.push(`Exported from Squire on ${formatDateTime(new Date().toISOString())}`);

  return lines.join('\n');
}

// === File Download ===

/**
 * Trigger download of content as a file
 */
function downloadAsFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export memory as Markdown file
 */
export function exportMemoryAsMarkdown(
  memory: ScoredMemory,
  entities?: EntitySummary[]
): void {
  const content = memoryToMarkdown(memory, entities);
  const date = new Date(memory.created_at).toISOString().split('T')[0];
  const filename = `memory-${date}-${memory.id.slice(0, 8)}.md`;
  downloadAsFile(content, filename, 'text/markdown');
}

/**
 * Export memory as text file
 */
export function exportMemoryAsText(memory: ScoredMemory): void {
  const content = memoryToText(memory);
  const date = new Date(memory.created_at).toISOString().split('T')[0];
  const filename = `memory-${date}-${memory.id.slice(0, 8)}.txt`;
  downloadAsFile(content, filename, 'text/plain');
}

