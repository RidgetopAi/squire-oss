export interface TaskResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface CourierTask {
  name: string;
  enabled: boolean;
  execute: () => Promise<TaskResult>;
}

const tasks = new Map<string, CourierTask>();

export function registerTask(name: string, task: CourierTask): void {
  tasks.set(name, task);
  console.log(`[Courier] Task registered: ${name}`);
}

export function unregisterTask(name: string): void {
  tasks.delete(name);
  console.log(`[Courier] Task unregistered: ${name}`);
}

export function listTasks(): CourierTask[] {
  return Array.from(tasks.values());
}

export async function runAllTasks(): Promise<void> {
  const enabledTasks = Array.from(tasks.values()).filter(t => t.enabled);
  console.log(`[Courier] Running ${enabledTasks.length} enabled tasks`);

  for (const task of enabledTasks) {
    try {
      console.log(`[Courier] Executing task: ${task.name}`);
      const result = await task.execute();
      console.log(`[Courier] Task ${task.name}: ${result.success ? 'success' : 'failed'} - ${result.message || ''}`);
    } catch (error) {
      console.error(`[Courier] Task ${task.name} threw error:`, error);
    }
  }
}
