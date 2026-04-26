/**
 * Job Service
 *
 * Lightweight async job tracker for Claude Code and sandbox dispatches.
 * Closes the feedback loop: dispatch work → CC runs in background →
 * job completes → Squire gets notified via Telegram → can take action.
 *
 * Jobs are tracked in-memory (ephemeral — survives the process lifetime only).
 * Results are also written to /tmp/squire-jobs/ for file-based access.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { notify } from './courier/notifier.js';

// --- Types ---

export type JobStatus = 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  task: string;
  status: JobStatus;
  sandboxPath?: string;
  model: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  result?: string;
  error?: string;
  files?: Array<{ path: string; size: number; sizeStr: string }>;
}

// --- Storage ---

const JOBS_DIR = '/tmp/squire-jobs';
const jobs = new Map<string, Job>();

function ensureJobsDir(): void {
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true });
  }
}

async function persistJob(job: Job): Promise<void> {
  ensureJobsDir();
  await fs.writeFile(
    path.join(JOBS_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2)
  );
}

// --- Public API ---

export function createJob(opts: {
  task: string;
  sandboxPath?: string;
  model: string;
}): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    task: opts.task,
    status: 'running',
    sandboxPath: opts.sandboxPath,
    model: opts.model,
    createdAt: new Date().toISOString(),
  };

  jobs.set(job.id, job);
  persistJob(job).catch(err => console.error('[Jobs] persist error:', err));

  console.log(`[Jobs] Created job ${job.id} (${opts.model})`);
  return job;
}

export async function completeJob(
  jobId: string,
  result: string,
  files?: Array<{ path: string; size: number; sizeStr: string }>
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    console.error(`[Jobs] Unknown job: ${jobId}`);
    return;
  }

  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.durationMs = Date.now() - new Date(job.createdAt).getTime();
  job.result = result;
  job.files = files;

  await persistJob(job);

  // Notify via Telegram
  const durationStr = job.durationMs ? `${(job.durationMs / 1000).toFixed(0)}s` : 'unknown';
  const fileCount = files?.length ?? 0;
  const taskPreview = job.task.length > 100 ? job.task.substring(0, 100) + '...' : job.task;

  let message = `*Job Complete* (${durationStr})\n\n`;
  message += `${taskPreview}\n\n`;
  if (fileCount > 0) {
    message += `${fileCount} output file${fileCount !== 1 ? 's' : ''} generated`;
    if (job.sandboxPath) {
      message += ` in sandbox`;
    }
    message += '\n';
  }
  message += `\n_Say "check job ${jobId.substring(0, 8)}" for details_`;

  await notify(message, { channels: ['telegram'] });
  console.log(`[Jobs] Completed job ${jobId} in ${durationStr}`);
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    console.error(`[Jobs] Unknown job: ${jobId}`);
    return;
  }

  job.status = 'failed';
  job.completedAt = new Date().toISOString();
  job.durationMs = Date.now() - new Date(job.createdAt).getTime();
  job.error = error;

  await persistJob(job);

  // Notify via Telegram
  const taskPreview = job.task.length > 80 ? job.task.substring(0, 80) + '...' : job.task;
  const message = `*Job Failed*\n\n${taskPreview}\n\nError: ${error.substring(0, 200)}`;

  await notify(message, { channels: ['telegram'] });
  console.log(`[Jobs] Failed job ${jobId}: ${error.substring(0, 100)}`);
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function findJob(partialId: string): Job | undefined {
  // Support partial ID matching (first 8 chars)
  for (const [id, job] of jobs) {
    if (id.startsWith(partialId)) return job;
  }
  return undefined;
}

export function listJobs(status?: JobStatus): Job[] {
  const allJobs = Array.from(jobs.values());
  if (status) return allJobs.filter(j => j.status === status);
  return allJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
