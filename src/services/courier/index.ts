export { start as startCourier, stop as stopCourier, isRunning, getStats, runNow } from './scheduler.js';
export { registerTask, unregisterTask, listTasks } from './tasks/index.js';
export type { CourierTask, TaskResult } from './tasks/index.js';

// Register built-in tasks
import { emailCheckTask } from './tasks/emailCheck.js';
import { registerTask } from './tasks/index.js';

// Auto-register email check task
registerTask('email-check', emailCheckTask);

import { goalWorkerTask } from './tasks/goalWorker.js';
registerTask('goal-worker', goalWorkerTask);

// Register Daily Brief task (sends 7 AM EDT)
import { dailyBriefTask } from './tasks/dailyBrief.js';
registerTask('daily-brief', dailyBriefTask);

// Register AgentMail check task (if configured)
if (process.env['AGENTMAIL_API_KEY']) {
  import('./tasks/agentmailCheck.js').then(({ agentmailCheckTask }) => {
    registerTask('agentmail-check', agentmailCheckTask);
  });
}
