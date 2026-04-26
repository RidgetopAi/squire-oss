/**
 * Web Search Tool
 *
 * Provides internet search capability using Tavily API.
 * Allows the LLM to look up current information, research topics, etc.
 */

import type { ToolHandler, ToolSpec } from './types.js';
import { assertPublicUrl } from '../utils/url-safety.js';

// === TYPES ===

interface WebSearchArgs {
  query: string;
  max_results?: number;
  search_depth?: 'basic' | 'advanced';
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

// === HANDLER ===

async function webSearch(args: WebSearchArgs): Promise<string> {
  const { query, max_results = 5, search_depth = 'basic' } = args;

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return 'Error: TAVILY_API_KEY environment variable not set. Cannot perform web search.';
  }

  if (!query || query.trim().length === 0) {
    return 'Error: Search query is required.';
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.trim(),
        max_results,
        search_depth,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Error: Tavily API returned ${response.status}: ${errorText}`;
    }

    const data = (await response.json()) as TavilyResponse;

    // Build formatted output
    const lines: string[] = [];

    // Include AI-generated answer if available
    if (data.answer) {
      lines.push('**Summary:**');
      lines.push(data.answer);
      lines.push('');
    }

    lines.push(`**Search Results for:** "${query}"`);
    lines.push('');

    if (!data.results || data.results.length === 0) {
      lines.push('No results found.');
      return lines.join('\n');
    }

    for (let i = 0; i < data.results.length; i++) {
      const result = data.results[i]!;
      lines.push(`${i + 1}. **${result.title}**`);
      lines.push(`   URL: ${result.url}`);
      lines.push(`   ${result.content}`);
      lines.push('');
    }

    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error performing web search: ${message}`;
  }
}

// === FETCH URL ===

interface FetchUrlArgs {
  url: string;
  max_length?: number;
}

async function fetchUrl(args: FetchUrlArgs): Promise<string> {
  const { url, max_length = 8000 } = args;

  if (!url || url.trim().length === 0) {
    return 'Error: URL is required.';
  }

  try {
    await assertPublicUrl(url.trim());
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const response = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Squire/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return `Error: HTTP ${response.status} fetching ${url}`;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
      return `Error: Unsupported content type "${contentType}" — can only read HTML, plain text, or JSON pages.`;
    }

    const html = await response.text();

    // Strip HTML tags and extract readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{3,}/g, '\n\n')
      .trim();

    if (text.length === 0) {
      return 'Error: Page returned no readable text content.';
    }

    const truncated = text.length > max_length;
    const output = truncated ? text.slice(0, max_length) + '\n\n[... content truncated ...]' : text;

    return `**Page content from:** ${url}\n\n${output}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error fetching URL: ${message}`;
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'web_search',
  description: 'Search the internet for current information. Use this when you need to look up recent events, find documentation, research topics, or get information that may not be in your training data. Returns titles, URLs, and snippets from relevant web pages.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up on the internet',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)',
      },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth: "basic" for quick results, "advanced" for more thorough search',
      },
    },
    required: ['query'],
  },
  handler: webSearch as ToolHandler,
}, {
  name: 'fetch_url',
  description: 'Fetch and read the content of a URL directly. Use this when the user pastes a URL and wants you to read it, or when you need to read a specific web page. Strips HTML and returns readable text. Works on articles, documentation, blog posts, etc.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch and read',
      },
      max_length: {
        type: 'number',
        description: 'Maximum characters to return (default: 8000)',
      },
    },
    required: ['url'],
  },
  handler: fetchUrl as ToolHandler,
}];
