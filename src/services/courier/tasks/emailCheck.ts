import { listSyncEnabledAccounts } from '../../google/auth.js';
import { listUnread, markManyAsRead } from '../../google/gmail.js';
import { summarizeEmails } from '../summarizer.js';
import { notifyEmailSummary, notifyNoEmails } from '../notifier.js';
import { cacheEmails } from '../../email-cache.js';
import type { CourierTask, TaskResult } from './index.js';

export const emailCheckTask: CourierTask = {
  name: 'email-check',
  enabled: true,
  async execute(): Promise<TaskResult> {
    try {
      // Get sync-enabled Google accounts
      const accounts = await listSyncEnabledAccounts();

      if (accounts.length === 0) {
        return { success: true, message: 'No Google accounts configured' };
      }

      // Use first account (single user system)
      const account = accounts[0]!;
      console.log(`[EmailCheck] Checking emails for ${account.email}`);

      // Get unread emails
      const emails = await listUnread(account.id);

      if (emails.length === 0) {
        await notifyNoEmails();
        return { success: true, message: 'No new emails' };
      }

      console.log(`[EmailCheck] Found ${emails.length} unread emails`);

      // Summarize via Grok
      const summaries = await summarizeEmails(emails);

      // Cache emails locally (before marking read so we never lose them)
      const cached = await cacheEmails(account.id, emails, summaries);
      console.log(`[EmailCheck] Cached ${cached}/${emails.length} emails locally`);

      // Push notifications
      await notifyEmailSummary(summaries);

      // Mark emails as read so they don't repeat
      const emailIds = emails.map(e => e.id);
      const markedCount = await markManyAsRead(account.id, emailIds);
      console.log(`[EmailCheck] Marked ${markedCount}/${emails.length} emails as read`);

      return {
        success: true,
        message: `Notified about ${emails.length} emails, cached ${cached}, marked ${markedCount} as read`,
        data: { count: emails.length, cached, markedAsRead: markedCount }
      };
    } catch (error) {
      console.error('[EmailCheck] Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
