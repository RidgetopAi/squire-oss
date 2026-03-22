import { agentmail } from '../../agentmail.js';
import type { CourierTask, TaskResult } from './index.js';
import { notify } from '../notifier.js';

// Track last check time to avoid duplicate notifications
let lastCheckTime: Date | null = null;

export const agentmailCheckTask: CourierTask = {
  name: 'agentmail-check',
  enabled: true,
  async execute(): Promise<TaskResult> {
    try {
      // Check if AgentMail is configured
      const apiKey = process.env['AGENTMAIL_API_KEY'];
      if (!apiKey) {
        return { success: true, message: 'AgentMail not configured' };
      }

      console.log('[AgentMailCheck] Checking for new messages');

      // Get recent messages
      const response = await agentmail.listMessages(20, 1);

      if (response.messages.length === 0) {
        return { success: true, message: 'No messages in inbox' };
      }

      // Filter for new messages since last check
      const now = new Date();
      const newMessages = lastCheckTime
        ? response.messages.filter(msg => new Date(msg.timestamp) > lastCheckTime!)
        : response.messages;

      lastCheckTime = now;

      if (newMessages.length === 0) {
        return { success: true, message: 'No new messages since last check' };
      }

      console.log(`[AgentMailCheck] Found ${newMessages.length} new messages`);

      // Build notification message
      const header = `📬 *AgentMail* (${newMessages.length} new)\n\n`;

      const body = newMessages.map((msg, i) => {
        const from = typeof msg.from === 'string'
          ? msg.from
          : (msg.from as any[]).map((f: any) => f.name || f.email).join(', ');
        const safeSubject = msg.subject.replace(/[*_`\[\]]/g, '');
        const preview = (msg.text?.substring(0, 80) || msg.html?.substring(0, 80) || '(no content)').replace(/[*_`\[\]]/g, '');
        return `*${i + 1}. ${from}*\n${safeSubject}\n${preview}...`;
      }).join('\n\n');

      const footer = '\n\n─────────────────\n_Use squire\\_email\\_list to see all messages_';
      const message = header + body + footer;

      // Send Telegram notification
      await notify(message, { channels: ['telegram'] });

      return {
        success: true,
        message: `Notified about ${newMessages.length} new messages`,
        data: { count: newMessages.length },
      };
    } catch (error) {
      console.error('[AgentMailCheck] Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
