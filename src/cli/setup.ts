/**
 * Interactive onboarding flow for new Squire users.
 *
 * Walks through: .env config, database, embeddings, identity, seed memories.
 * Idempotent — detects existing state and skips completed steps.
 */

import { createInterface } from 'readline/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');

// ─── Readline helpers ────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(prompt: string, fallback = ''): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`  ${prompt}${suffix}: `)).trim();
  return answer || fallback;
}

async function confirm(prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await rl.question(`  ${prompt} (${hint}): `)).trim().toLowerCase();
  if (answer === '') return defaultYes;
  return answer.startsWith('y');
}

async function choose(prompt: string, options: string[], fallback: string): Promise<string> {
  console.log(`  ${prompt}`);
  for (const opt of options) {
    const marker = opt === fallback ? ' (default)' : '';
    console.log(`    - ${opt}${marker}`);
  }
  const answer = (await rl.question(`  Choice [${fallback}]: `)).trim().toLowerCase();
  if (answer === '') return fallback;
  if (options.includes(answer)) return answer;
  console.log(`  Invalid choice, using default: ${fallback}`);
  return fallback;
}

function heading(text: string): void {
  console.log(`\n--- ${text} ---\n`);
}

function done(text: string): void {
  console.log(`  OK: ${text}`);
}

function skip(text: string): void {
  console.log(`  SKIP: ${text}`);
}

function warn(text: string): void {
  console.log(`  WARN: ${text}`);
}

// ─── Phase 1: Welcome ────────────────────────────────────────────────

async function welcome(): Promise<void> {
  console.log('\n  Welcome to Squire — AI memory that knows you.\n');
  console.log('  This setup will walk you through:');
  console.log('    1. Configuration (.env file)');
  console.log('    2. Database setup');
  console.log('    3. Embedding provider');
  console.log('    4. Your identity');
  console.log('    5. Initial memories about you');
  console.log('');
}

// ─── Phase 2: Config (.env) ─────────────────────────────────────────

interface EnvConfig {
  databaseUrl: string;
  llmProvider: string;
  llmModel: string;
  apiKey: string;
  apiKeyVar: string;
  embedProvider: string;
  embedModel: string;
  embedDimension: string;
  ollamaUrl: string;
  openaiApiKey: string;
  port: string;
}

const LLM_PROVIDERS: Record<string, { models: string[]; defaultModel: string; keyVar: string; keyPrompt: string }> = {
  anthropic: {
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
    defaultModel: 'claude-sonnet-4-6',
    keyVar: 'ANTHROPIC_API_KEY',
    keyPrompt: 'Anthropic API key',
  },
  groq: {
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    defaultModel: 'llama-3.3-70b-versatile',
    keyVar: 'GROQ_API_KEY',
    keyPrompt: 'Groq API key',
  },
  xai: {
    models: ['grok-3-fast', 'grok-4-1-fast-reasoning'],
    defaultModel: 'grok-3-fast',
    keyVar: 'XAI_API_KEY',
    keyPrompt: 'xAI API key',
  },
  gemini: {
    models: ['gemini-1.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-1.5-pro',
    keyVar: 'GEMINI_API_KEY',
    keyPrompt: 'Gemini API key',
  },
  ollama: {
    models: ['llama3.2', 'mistral', 'phi3'],
    defaultModel: 'llama3.2',
    keyVar: '',
    keyPrompt: '',
  },
};

async function configPhase(): Promise<boolean> {
  heading('1. Configuration');

  const envPath = join(PROJECT_ROOT, '.env');
  const examplePath = join(PROJECT_ROOT, '.env.example');

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const hasDbUrl = content.includes('DATABASE_URL=') && !content.includes('DATABASE_URL=\n');
    if (hasDbUrl) {
      done('.env exists with DATABASE_URL configured');
      const reconfigure = await confirm('Reconfigure .env?', false);
      if (!reconfigure) return false; // signal: did not write new .env
    }
  }

  if (!existsSync(examplePath)) {
    warn('.env.example not found — cannot generate .env template');
    return false;
  }

  // LLM provider
  const provider = await choose(
    'LLM provider:',
    Object.keys(LLM_PROVIDERS),
    'anthropic',
  );
  const providerInfo = LLM_PROVIDERS[provider]!;

  // Model
  const model = await choose(
    'LLM model:',
    providerInfo.models,
    providerInfo.defaultModel,
  );

  // API key (if needed)
  let apiKey = '';
  if (providerInfo.keyVar) {
    apiKey = await ask(providerInfo.keyPrompt);
    if (!apiKey) {
      warn(`No API key provided — set ${providerInfo.keyVar} in .env later`);
    }
  }

  // Embedding
  const embedProvider = await choose(
    'Embedding provider:',
    ['ollama', 'openai'],
    'ollama',
  );

  let ollamaUrl = 'http://localhost:11434';
  let embedModel: string;
  let embedDimension: string;
  let openaiApiKey = '';

  if (embedProvider === 'openai') {
    openaiApiKey = await ask('OpenAI API key');
    if (!openaiApiKey) {
      warn('No API key provided — set OPENAI_API_KEY in .env later');
    }
    embedModel = await choose(
      'OpenAI embedding model:',
      ['text-embedding-3-small', 'text-embedding-3-large'],
      'text-embedding-3-small',
    );
    embedDimension = embedModel === 'text-embedding-3-large' ? '3072' : '1536';
  } else {
    ollamaUrl = await ask('Ollama URL', 'http://localhost:11434');
    embedModel = await choose(
      'Embedding model:',
      ['nomic-embed-text', 'mxbai-embed-large'],
      'nomic-embed-text',
    );
    embedDimension = embedModel === 'mxbai-embed-large' ? '1024' : '768';
  }

  // Database
  const databaseUrl = await ask(
    'Database URL',
    'postgresql://squire:squire_dev@localhost:5435/squire',
  );

  const port = await ask('API server port', '3000');

  // Write .env
  const envConfig: EnvConfig = {
    databaseUrl,
    llmProvider: provider,
    llmModel: model,
    apiKey,
    apiKeyVar: providerInfo.keyVar,
    embedProvider,
    embedModel,
    embedDimension,
    ollamaUrl,
    openaiApiKey,
    port,
  };

  writeEnvFile(envPath, envConfig);
  done('.env written');
  return true; // signal: wrote new .env
}

function writeEnvFile(path: string, c: EnvConfig): void {
  const lines = [
    '# Generated by squire setup',
    '',
    '# Database',
    `DATABASE_URL=${c.databaseUrl}`,
    '',
    '# API Server',
    `PORT=${c.port}`,
    'NODE_ENV=development',
    '',
    '# LLM',
    `LLM_PROVIDER=${c.llmProvider}`,
    `LLM_MODEL=${c.llmModel}`,
    'LLM_MAX_TOKENS=8192',
    'LLM_TEMPERATURE=0.7',
  ];

  if (c.apiKeyVar && c.apiKey) {
    lines.push(`${c.apiKeyVar}=${c.apiKey}`);
  } else if (c.apiKeyVar) {
    lines.push(`# ${c.apiKeyVar}=your_key_here`);
  }

  lines.push(
    '',
    '# Embeddings',
    `EMBED_PROVIDER=${c.embedProvider}`,
    `EMBED_MODEL=${c.embedModel}`,
    `EMBED_DIMENSION=${c.embedDimension}`,
  );

  if (c.embedProvider === 'openai') {
    if (c.openaiApiKey) {
      lines.push(`OPENAI_API_KEY=${c.openaiApiKey}`);
    } else {
      lines.push('# OPENAI_API_KEY=your_key_here');
    }
  } else {
    lines.push(`OLLAMA_URL=${c.ollamaUrl}`);
  }

  writeFileSync(path, lines.join('\n') + '\n');
}

// ─── Phase 3: Database ──────────────────────────────────────────────

async function databasePhase(): Promise<boolean> {
  heading('2. Database');

  // Check if docker container is running
  let containerRunning = false;
  try {
    const output = execSync('docker ps --filter name=squire-db --format "{{.Status}}"', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    containerRunning = output.length > 0 && output.toLowerCase().includes('up');
  } catch {
    // docker not available or not running
  }

  if (!containerRunning) {
    const startDocker = await confirm('Database container not running. Start it with docker compose?', true);
    if (startDocker) {
      console.log('  Starting database...');
      try {
        execSync('docker compose up -d', {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          timeout: 30000,
          stdio: 'pipe',
        });
        // Wait for healthcheck
        console.log('  Waiting for database to be ready...');
        let healthy = false;
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const status = execSync(
              'docker inspect --format="{{.State.Health.Status}}" squire-db',
              { encoding: 'utf-8', timeout: 5000 },
            ).trim();
            if (status === 'healthy') {
              healthy = true;
              break;
            }
          } catch {
            // container not ready yet
          }
        }
        if (!healthy) {
          warn('Database did not become healthy in 30s — continuing anyway');
        } else {
          done('Database container running and healthy');
        }
      } catch (err) {
        warn(`Failed to start database: ${err instanceof Error ? err.message : err}`);
        console.log('  Please start the database manually: docker compose up -d');
        return false;
      }
    } else {
      console.log('  Skipping — make sure your database is accessible');
    }
  } else {
    done('Database container already running');
  }

  // We need to reload config now that .env may have changed
  // Import dynamically to pick up the new .env
  const dotenv = await import('dotenv');
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: true });

  // Test connection
  const { checkConnection } = await import('../db/pool.js');
  const connected = await checkConnection();
  if (!connected) {
    warn('Cannot connect to database — check DATABASE_URL in .env');
    return false;
  }
  done('Database connected');

  // Run migrations
  console.log('  Running migrations...');
  const { migrate } = await import('../db/migrate.js');
  const applied = await migrate({ silent: false, managePool: false });
  if (applied > 0) {
    done(`Applied ${applied} migration(s)`);
  } else {
    done('Database schema up to date');
  }

  return true;
}

// ─── Phase 4: Embedding check ───────────────────────────────────────

async function embeddingPhase(): Promise<boolean> {
  heading('3. Embeddings');

  const { checkEmbeddingHealth } = await import('../providers/embeddings.js');
  const healthy = await checkEmbeddingHealth();

  if (healthy) {
    done('Embedding provider connected and working');
    return true;
  }

  warn('Embedding provider not reachable');

  // Check if Ollama is the provider
  const provider = process.env['EMBED_PROVIDER'] || 'ollama';
  const model = process.env['EMBED_MODEL'] || 'nomic-embed-text';

  if (provider === 'ollama') {
    const ollamaUrl = process.env['OLLAMA_URL'] || 'http://localhost:11434';
    console.log(`  Ollama URL: ${ollamaUrl}`);
    console.log(`  Model: ${model}`);

    // Try to check if Ollama is running
    try {
      execSync(`curl -sf ${ollamaUrl}/api/tags > /dev/null 2>&1`, { timeout: 5000 });
      // Ollama is running but model might not be pulled
      const pullModel = await confirm(`Ollama is running. Pull ${model}?`, true);
      if (pullModel) {
        console.log(`  Pulling ${model} (this may take a while)...`);
        try {
          execSync(`ollama pull ${model}`, {
            encoding: 'utf-8',
            timeout: 300000,
            stdio: 'inherit',
          });
          // Re-check health
          const retryHealthy = await checkEmbeddingHealth();
          if (retryHealthy) {
            done('Embedding provider now working');
            return true;
          }
        } catch {
          warn('Failed to pull model');
        }
      }
    } catch {
      warn('Ollama does not appear to be running');
      console.log('  Install: https://ollama.com');
      console.log(`  Then: ollama pull ${model}`);
    }
  }

  console.log('  You can continue setup, but memories will not be embeddable until this is fixed.');
  return false;
}

// ─── Phase 5: Identity ──────────────────────────────────────────────

async function identityPhase(): Promise<string | null> {
  heading('4. Identity');

  const { getUserIdentity, setInitialIdentity } = await import('../services/identity.js');
  const existing = await getUserIdentity();

  if (existing) {
    done(`Identity already set: ${existing.name}`);
    return existing.name;
  }

  const name = await ask("What's your name?");
  if (!name) {
    warn('No name provided — you can set it later with the API');
    return null;
  }

  await setInitialIdentity(name, 'onboarding');
  done(`Identity set: ${name}`);
  return name;
}

// ─── Phase 6: Seed memories ─────────────────────────────────────────

interface SeedQuestion {
  prompt: string;
  prefix: string; // prepended to answer for better context in the memory
}

const SEED_QUESTIONS: SeedQuestion[] = [
  {
    prompt: 'What do you do? (role, work, profession)',
    prefix: 'About me: ',
  },
  {
    prompt: 'What are you currently working on?',
    prefix: 'I am currently working on: ',
  },
  {
    prompt: 'What are your main interests or hobbies?',
    prefix: 'My interests and hobbies: ',
  },
  {
    prompt: 'Anything else you\'d like Squire to remember about you?',
    prefix: '',
  },
];

async function seedPhase(userName: string | null): Promise<number> {
  heading('5. Initial Memories');

  console.log('  A few questions to seed your memory. Press Enter to skip any.\n');

  const { createMemory } = await import('../services/memories.js');
  const { classifyMemoryCategories, linkMemoryToCategories } = await import('../services/summaries.js');
  const { processMemoryForBeliefs } = await import('../services/beliefs.js');

  let seeded = 0;

  for (const q of SEED_QUESTIONS) {
    const answer = await ask(q.prompt);
    if (!answer) continue;

    const content = q.prefix ? `${q.prefix}${answer}` : answer;

    try {
      const { memory } = await createMemory({
        content,
        source: 'onboarding',
        content_type: 'text',
        source_metadata: { onboarding: true, userName: userName || undefined },
      });

      // Classify into summary categories
      const classifications = await classifyMemoryCategories(content);
      if (classifications.length > 0) {
        await linkMemoryToCategories(memory.id, classifications);
      }

      // Extract beliefs
      await processMemoryForBeliefs(memory.id, content);

      seeded++;
      done(`Stored (salience: ${memory.salience_score.toFixed(1)})`);
    } catch (err) {
      warn(`Failed to store memory: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (seeded === 0) {
    skip('No memories seeded — you can add them later with: squire observe');
    return 0;
  }

  // Generate initial living summaries from seeded memories
  console.log('\n  Generating initial summaries from your answers...');
  try {
    const { updateAllSummaries } = await import('../services/summaries.js');
    const result = await updateAllSummaries();
    if (result.updated.length > 0) {
      done(`Generated summaries: ${result.updated.join(', ')}`);
    } else {
      done('Summaries will generate as more memories accumulate');
    }
  } catch (err) {
    warn(`Summary generation failed: ${err instanceof Error ? err.message : err}`);
  }

  return seeded;
}

// ─── Phase 7: Verify ────────────────────────────────────────────────

async function verifyPhase(userName: string | null, memoriesSeeded: number): Promise<void> {
  heading('6. Summary');

  const { checkConnection } = await import('../db/pool.js');
  const { checkEmbeddingHealth } = await import('../providers/embeddings.js');
  const { checkLLMHealth, getLLMInfo } = await import('../providers/llm.js');

  const [dbOk, embedOk, llmOk] = await Promise.all([
    checkConnection(),
    checkEmbeddingHealth(),
    checkLLMHealth(),
  ]);

  const llmInfo = getLLMInfo();

  console.log(`  Database:   ${dbOk ? 'Connected' : 'Not connected'}`);
  console.log(`  Embeddings: ${embedOk ? 'Connected' : 'Not connected'}`);
  console.log(`  LLM:        ${llmOk ? 'Connected' : 'Not connected'} (${llmInfo.provider}/${llmInfo.model})`);
  console.log(`  Identity:   ${userName || 'Not set'}`);
  console.log(`  Memories:   ${memoriesSeeded} seeded`);

  console.log('\n  Setup complete.\n');
  console.log('  Next steps:');
  console.log('    squire status     — check system health');
  console.log('    squire observe    — store a new memory');
  console.log('    squire search     — search your memories');
  console.log('    squire context    — generate AI context from memory');
  console.log('');
}

// ─── Main ────────────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  try {
    await welcome();

    const wroteEnv = await configPhase();

    // If we just wrote a new .env, reload env vars
    if (wroteEnv) {
      const dotenv = await import('dotenv');
      dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: true });
    }

    const dbReady = await databasePhase();
    if (!dbReady) {
      console.log('\n  Database is not ready. Fix the connection and re-run: squire setup\n');
      rl.close();
      return;
    }

    await embeddingPhase();

    const userName = await identityPhase();

    const memoriesSeeded = await seedPhase(userName);

    await verifyPhase(userName, memoriesSeeded);
  } finally {
    rl.close();
    const { closePool } = await import('../db/pool.js');
    await closePool();
  }
}
