import { callLLM } from '../llm/index.js';
import type { Email } from '../google/gmail.js';

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  summary: string;
}

const SUMMARIZE_PROMPT = `Summarize each email in 1-2 lines. Be concise. Highlight the key point or action needed.

Format each as: "• [Sender Name] - [Summary]"

Emails:
{emails}`;

export async function summarizeEmails(emails: Email[]): Promise<EmailSummary[]> {
  if (emails.length === 0) return [];

  const formatted = emails.map(e =>
    `From: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`
  ).join('\n\n---\n\n');

  try {
    const response = await callLLM(
      [{ role: 'user', content: SUMMARIZE_PROMPT.replace('{emails}', formatted) }],
      undefined,
      { provider: 'xai', model: 'grok-3-fast', maxTokens: 1000, temperature: 0.3 }
    );

    const summaryText = response.content || '';

    // Parse summaries back to structured format
    // Each line is "• [Sender] - [Summary]"
    const lines = summaryText.split('\n').filter((l: string) => l.trim().startsWith('•'));

    return emails.map((email, i) => ({
      id: email.id,
      from: email.from,
      subject: email.subject,
      summary: lines[i]?.replace(/^•\s*/, '').trim() || email.snippet.substring(0, 100),
    }));
  } catch (error) {
    console.error('[Summarizer] Error:', error);
    // Fallback: use snippets as summaries
    return emails.map(email => ({
      id: email.id,
      from: email.from,
      subject: email.subject,
      summary: `${email.from.split('<')[0]?.trim() ?? ''} - ${email.snippet.substring(0, 80)}`,
    }));
  }
}
