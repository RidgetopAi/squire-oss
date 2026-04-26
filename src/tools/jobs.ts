/**
 * Job Status Tools
 *
 * Check on async jobs dispatched via sandbox (async: true).
 * Jobs are tracked in-memory by the jobs service.
 */

import type { ToolHandler, ToolSpec } from './types.js';
import { getJob, findJob, listJobs } from '../services/jobs.js';

interface JobStatusArgs {
  job_id: string;
}

async function jobStatus(args: JobStatusArgs): Promise<string> {
  const { job_id } = args;

  if (!job_id) {
    return 'Error: job_id is required.';
  }

  // Try exact match first, then partial
  const job = getJob(job_id) || findJob(job_id);

  if (!job) {
    return `No job found matching: ${job_id}`;
  }

  const lines: string[] = [];
  lines.push(`**Job ${job.id}**`);
  lines.push(`Status: ${job.status}`);
  lines.push(`Model: ${job.model}`);
  lines.push(`Created: ${job.createdAt}`);

  if (job.sandboxPath) {
    lines.push(`Sandbox: \`${job.sandboxPath}\``);
  }

  if (job.status === 'running') {
    const elapsed = Date.now() - new Date(job.createdAt).getTime();
    lines.push(`Elapsed: ${(elapsed / 1000).toFixed(0)}s`);
  }

  if (job.completedAt) {
    lines.push(`Completed: ${job.completedAt}`);
  }

  if (job.durationMs) {
    lines.push(`Duration: ${(job.durationMs / 1000).toFixed(1)}s`);
  }

  lines.push('');
  lines.push(`Task: ${job.task}`);

  if (job.result) {
    lines.push('');
    lines.push('### Result');
    lines.push(job.result);
  }

  if (job.error) {
    lines.push('');
    lines.push('### Error');
    lines.push(job.error);
  }

  if (job.files && job.files.length > 0) {
    lines.push('');
    lines.push(`### Output Files (${job.files.length})`);
    for (const file of job.files) {
      lines.push(`- \`${file.path}\` (${file.sizeStr})`);
    }
  }

  return lines.join('\n');
}

async function jobList(): Promise<string> {
  const all = listJobs();

  if (all.length === 0) {
    return 'No jobs tracked in this session.';
  }

  const lines: string[] = [];
  lines.push(`**Jobs** (${all.length})`);
  lines.push('');

  for (const job of all) {
    const taskPreview = job.task.length > 60 ? job.task.substring(0, 60) + '...' : job.task;
    const status = job.status === 'running' ? 'running' :
                   job.status === 'completed' ? 'done' : 'failed';
    const duration = job.durationMs ? ` (${(job.durationMs / 1000).toFixed(0)}s)` : '';
    lines.push(`- \`${job.id.substring(0, 8)}\` [${status}]${duration} ${taskPreview}`);
  }

  return lines.join('\n');
}

export const tools: ToolSpec[] = [
  {
    name: 'job_status',
    description: `Check the status of an async sandbox job.

Returns job status (running/completed/failed), result, output files, and timing.
Supports full or partial (first 8 chars) job IDs.`,
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'Job ID (full UUID or first 8 characters)',
        },
      },
      required: ['job_id'],
    },
    handler: jobStatus as ToolHandler,
  },
  {
    name: 'job_list',
    description: `List all tracked async jobs in this session.

Shows job ID, status, duration, and task summary for each job.`,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: jobList as ToolHandler,
  },
];
