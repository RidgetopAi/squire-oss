import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  // Auto-detect timezone from system
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

  // Persona — who the user is. Squire personalizes responses around these.
  // PERSONA_FILE points to a markdown file describing the user
  // (see prompts/persona.example.md as a template).
  persona: {
    file: optional('PERSONA_FILE', './prompts/persona.example.md'),
    userName: optional('USER_NAME', 'the user'),
  },

  database: {
    url: required('DATABASE_URL'),
  },
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
    corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3001'),
  },
  embedding: {
    provider: optional('EMBED_PROVIDER', 'ollama') as 'ollama' | 'groq',
    dimension: parseInt(optional('EMBED_DIMENSION', '768'), 10),
    model: optional('EMBED_MODEL', 'nomic-embed-text'),
    ollamaUrl: optional('OLLAMA_URL', 'http://localhost:11434'),
  },
  llm: {
    provider: optional('LLM_PROVIDER', 'anthropic') as 'groq' | 'xai' | 'ollama' | 'gemini' | 'anthropic',
    model: optional('LLM_MODEL', 'claude-sonnet-4-6'),
    groqApiKey: process.env['GROQ_API_KEY'] ?? '',
    xaiApiKey: process.env['XAI_API_KEY'] ?? '',
    geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
    groqUrl: optional('GROQ_URL', 'https://api.groq.com/openai/v1'),
    xaiUrl: optional('XAI_URL', 'https://api.x.ai/v1'),
    geminiUrl: optional('GEMINI_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
    anthropicUrl: optional('ANTHROPIC_URL', 'https://api.anthropic.com'),
    ollamaUrl: optional('OLLAMA_URL', 'http://localhost:11434'),
    maxTokens: parseInt(optional('LLM_MAX_TOKENS', '8192'), 10),
    temperature: parseFloat(optional('LLM_TEMPERATURE', '0.7')),
    apiTimeoutMs: parseInt(optional('LLM_API_TIMEOUT_MS', '60000'), 10),
  },
  search: {
    documentThreshold: parseFloat(optional('SEARCH_DOCUMENT_THRESHOLD', '0.55')),
    contextThreshold: parseFloat(optional('SEARCH_CONTEXT_THRESHOLD', '0.5')),
    notesThreshold: parseFloat(optional('SEARCH_NOTES_THRESHOLD', '0.35')),
  },
  telegram: {
    botToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
    allowedUserIds: (process.env['TELEGRAM_ALLOWED_USER_IDS'] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    pollingIntervalMs: parseInt(optional('TELEGRAM_POLLING_INTERVAL_MS', '1000'), 10),
  },
  coding: {
    workingDirectory: optional('CODING_WORKING_DIR', process.cwd()),
    defaultTimeoutMs: parseInt(optional('CODING_TIMEOUT_MS', '30000'), 10),
    maxOutputBytes: parseInt(optional('CODING_MAX_OUTPUT_BYTES', '1048576'), 10), // 1MB
    blockedCommands: [
      'rm -rf /',
      'rm -rf /*',
      'mkfs',
      'dd if=/dev/zero',
      'dd if=/dev/random',
      ':(){:|:&};:', // fork bomb
      '> /dev/sda',
      'chmod -R 777 /',
      'chown -R',
    ],
  },
  routing: {
    enabled: optional('ROUTING_ENABLED', 'true') === 'true',
    defaultTier: optional('ROUTING_DEFAULT_TIER', 'smart') as 'smart' | 'fast',
    smart: {
      provider: optional('ROUTING_SMART_PROVIDER', 'anthropic') as 'anthropic' | 'xai' | 'groq' | 'gemini' | 'ollama',
      model: optional('ROUTING_SMART_MODEL', 'claude-sonnet-4-6'),
    },
    fast: {
      provider: optional('ROUTING_FAST_PROVIDER', 'xai') as 'anthropic' | 'xai' | 'groq' | 'gemini' | 'ollama',
      model: optional('ROUTING_FAST_MODEL', 'grok-4-1-fast-reasoning'),
    },
  },
  goalWorker: {
    enabled: optional('GOAL_WORKER_ENABLED', 'true') === 'true',
    intervalMs: parseInt(optional('GOAL_WORKER_INTERVAL_MS', '3600000'), 10), // 1 hour
    maxTurns: parseInt(optional('GOAL_WORKER_MAX_TURNS', '15'), 10),
    maxExecutionMs: parseInt(optional('GOAL_WORKER_MAX_EXECUTION_MS', '300000'), 10), // 5 min
  },
  courier: {
    enabled: optional('COURIER_ENABLED', 'true') === 'true',
    intervalMs: parseInt(optional('COURIER_INTERVAL_MS', '1800000'), 10), // 30 min
    quietHoursStart: parseInt(optional('COURIER_QUIET_START', '22'), 10), // 10pm
    quietHoursEnd: parseInt(optional('COURIER_QUIET_END', '7'), 10), // 7am
    retryAttempts: parseInt(optional('COURIER_RETRY_ATTEMPTS', '3'), 10),
    retryDelayMs: parseInt(optional('COURIER_RETRY_DELAY_MS', '15000'), 10), // 15 sec
  },
  expressionEvaluator: {
    enabled: optional('EXPRESSION_EVALUATOR_ENABLED', 'true') === 'true',
    provider: optional('EXPRESSION_EVALUATOR_PROVIDER', 'ollama') as 'ollama' | 'groq' | 'xai' | 'gemini' | 'anthropic',
    model: optional('EXPRESSION_EVALUATOR_MODEL', 'qwen2.5:3b'),
    batchSize: parseInt(optional('EXPRESSION_EVALUATOR_BATCH_SIZE', '10'), 10),
  },
  commune: {
    enabled: optional('COMMUNE_ENABLED', 'true') === 'true',
    intervalMs: parseInt(optional('COMMUNE_INTERVAL_MS', '900000'), 10), // 15 min default
    quietHoursStart: parseInt(optional('COMMUNE_QUIET_START', '22'), 10), // 10pm
    quietHoursEnd: parseInt(optional('COMMUNE_QUIET_END', '7'), 10), // 7am
    maxDailyMessages: parseInt(optional('COMMUNE_MAX_DAILY', '5'), 10),
    minHoursBetweenMessages: parseFloat(optional('COMMUNE_MIN_HOURS_BETWEEN', '2')),
    defaultChannel: optional('COMMUNE_DEFAULT_CHANNEL', 'telegram') as 'telegram' | 'push' | 'email',
  },
  agentmail: {
    apiKey: process.env['AGENTMAIL_API_KEY'] ?? '',
    baseUrl: optional('AGENTMAIL_BASE_URL', 'https://api.agentmail.to/v0'),
    inboxId: process.env['AGENTMAIL_INBOX_ID'] ?? '',
  },
  recall: {
    userStopwords: (process.env['RECALL_USER_STOPWORDS'] ?? '').split(',').filter(Boolean),
    cacheTtlMs: parseInt(optional('RECALL_CACHE_TTL_MS', '300000'), 10),
    rerankerEnabled: optional('RECALL_RERANKER_ENABLED', 'true') === 'true',
    rerankerProvider: optional('RECALL_RERANKER_PROVIDER', 'xai') as 'xai' | 'anthropic',
    rerankerModel: optional('RECALL_RERANKER_MODEL', 'grok-4-1-fast-reasoning'),
    maxRerankerCandidates: parseInt(optional('RECALL_RERANKER_POOL', '15'), 10),
  },
  security: {
    apiKey: process.env['SQUIRE_API_KEY'] ?? '',
    rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10), // 15 min
    rateLimitMax: parseInt(optional('RATE_LIMIT_MAX', '100'), 10),
    chatRateLimitMax: parseInt(optional('CHAT_RATE_LIMIT_MAX', '20'), 10),
  },
} as const;

export type Config = typeof config;
