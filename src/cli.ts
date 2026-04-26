#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createMemory, listMemories, countMemories, searchMemories, getMemory } from './services/knowledge/memories.js';
import { generateContext, listProfiles } from './services/chat/context.js';
import {
  listEntities,
  findEntityByName,
  countEntitiesByType,
  EntityType,
} from './services/knowledge/entities.js';
import { consolidateAll, getConsolidationStats } from './services/consolidation.js';
import { getRelatedMemories, getEdgeStats } from './services/knowledge/edges.js';
import { parseImportFile, importMemories, getImportStats } from './services/import.js';
import {
  getAllSummaries,
  getSummary,
  generateSummary,
  updateAllSummaries,
  getSummaryStats,
  isValidCategory,
  SUMMARY_CATEGORIES,
  classifyMemoryCategories,
  linkMemoryToCategories,
  type SummaryCategory,
} from './services/summaries.js';
import {
  processMemoryForBeliefs,
  getAllBeliefs,
  getBelief,
  getBeliefEvidence,
  getBeliefStats,
  getUnresolvedConflicts,
  isValidBeliefType,
  BELIEF_TYPES,
  getBeliefTypeDescription,
  type BeliefType,
} from './services/knowledge/beliefs.js';
import {
  getAllPatterns,
  getPattern,
  getPatternEvidence,
  getPatternStats,
  isValidPatternType,
  PATTERN_TYPES,
  getPatternTypeDescription,
  type PatternType,
} from './services/knowledge/patterns.js';
import {
  getAllInsights,
  getInsight,
  getInsightSources,
  getInsightStats,
  dismissInsight,
  actionInsight,
  isValidInsightType,
  INSIGHT_TYPES,
  INSIGHT_PRIORITIES,
  getInsightTypeDescription,
  getInsightTypeEmoji,
  getPriorityEmoji,
  type InsightType,
  type InsightPriority,
} from './services/knowledge/insights.js';
import {
  getAllGaps,
  getGap,
  getGapSources,
  getGapStats,
  dismissGap,
  fillGap,
  getAllQuestions,
  getQuestion,
  getQuestionSources,
  getQuestionStats,
  askQuestion,
  answerQuestion,
  dismissQuestion,
  GAP_TYPES,
  GAP_PRIORITIES,
  QUESTION_TYPES,
  TIMING_HINTS,
  getGapTypeEmoji,
  getQuestionTypeEmoji,
  getTimingHintDescription,
  type GapType,
  type GapPriority,
  type QuestionType,
  type TimingHint,
} from './services/research.js';
import {
  findEntityNeighbors,
  findSharedMemories,
  traverseEntities,
  findPathBetweenEntities,
  getEntitySubgraph,
  getGraphStats,
} from './services/knowledge/graph.js';
import { getEntity, searchEntities } from './services/knowledge/entities.js';
import {
  createObject,
  getObjectById,
  listObjects,
  deleteObject,
  linkToMemory,
  unlinkFromMemory,
  linkToEntity,
  addTag,
  removeTag,
  getObjectTags,
  getAllTags,
  createCollection,
  getCollectionById,
  listCollections,
  addToCollection,
  removeFromCollection,
  getCollectionObjects,
  getObjectStats,
  OBJECT_TYPES,
  type ObjectType,
} from './services/storage/objects.js';
import { pool, checkConnection, closePool } from './db/pool.js';
import { checkEmbeddingHealth } from './providers/embeddings.js';
import { checkLLMHealth, getLLMInfo } from './providers/llm.js';
import { config } from './config/index.js';

const program = new Command();

program
  .name('squire')
  .description('AI memory system - memory that knows the user')
  .version('0.1.0');

/**
 * observe - Store a new memory
 */
program
  .command('observe')
  .description('Store a new observation as a memory')
  .argument('<content>', 'The content to remember')
  .option('-s, --source <source>', 'Source of the observation', 'cli')
  .option('-t, --type <type>', 'Content type', 'text')
  .action(async (content: string, options: { source: string; type: string }) => {
    try {
      const { memory, entities } = await createMemory({
        content,
        source: options.source,
        content_type: options.type,
      });

      console.log('\nMemory stored successfully!');
      console.log(`  ID: ${memory.id}`);
      console.log(`  Salience: ${memory.salience_score}`);
      console.log(`  Created: ${memory.created_at}`);

      if (entities.length > 0) {
        const entityList = entities.map((e) => `${e.name} (${e.entity_type})`).join(', ');
        console.log(`  Entities: ${entityList}`);
      }

      // Classify memory into summary categories
      const classifications = await classifyMemoryCategories(content);
      if (classifications.length > 0) {
        await linkMemoryToCategories(memory.id, classifications);
        const categories = classifications.map((c) => c.category).join(', ');
        console.log(`  Categories: ${categories}`);
      }

      // Extract beliefs from memory
      const beliefResult = await processMemoryForBeliefs(memory.id, content);
      if (beliefResult.created.length > 0 || beliefResult.reinforced.length > 0) {
        const parts: string[] = [];
        if (beliefResult.created.length > 0) {
          parts.push(`${beliefResult.created.length} new`);
        }
        if (beliefResult.reinforced.length > 0) {
          parts.push(`${beliefResult.reinforced.length} reinforced`);
        }
        console.log(`  Beliefs: ${parts.join(', ')}`);

        if (beliefResult.conflicts.length > 0) {
          console.log(`  ⚠ ${beliefResult.conflicts.length} belief conflict(s) detected`);
        }
      }
    } catch (error) {
      console.error('Failed to store memory:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * list - List stored memories
 */
program
  .command('list')
  .description('List stored memories')
  .option('-l, --limit <limit>', 'Maximum number of memories to show', '10')
  .option('-s, --source <source>', 'Filter by source')
  .action(async (options: { limit: string; source?: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const [memories, total] = await Promise.all([
        listMemories({ limit, source: options.source }),
        countMemories(),
      ]);

      if (memories.length === 0) {
        console.log('\nNo memories found.');
        console.log('Use "squire observe <content>" to store your first memory.');
      } else {
        console.log(`\nMemories (${memories.length} of ${total}):\n`);

        for (const memory of memories) {
          const date = new Date(memory.created_at).toLocaleString();
          const preview = memory.content.length > 60
            ? memory.content.substring(0, 60) + '...'
            : memory.content;

          console.log(`[${memory.id.substring(0, 8)}] ${date}`);
          console.log(`  ${preview}`);
          console.log(`  salience: ${memory.salience_score} | source: ${memory.source}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to list memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * search - Semantic search for memories
 */
program
  .command('search')
  .description('Semantic search for memories')
  .argument('<query>', 'Search query')
  .option('-l, --limit <limit>', 'Maximum number of results', '10')
  .option('-m, --min-similarity <min>', 'Minimum similarity threshold (0-1)', '0.3')
  .action(async (query: string, options: { limit: string; minSimilarity: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const minSimilarity = parseFloat(options.minSimilarity);

      console.log(`\nSearching for: "${query}"\n`);

      const results = await searchMemories(query, { limit, minSimilarity });

      if (results.length === 0) {
        console.log('No matching memories found.');
      } else {
        console.log(`Found ${results.length} matching memories:\n`);

        for (const memory of results) {
          const date = new Date(memory.created_at).toLocaleString();
          const similarity = (memory.similarity * 100).toFixed(1);
          const salience = memory.salience_score.toFixed(1);
          const score = (memory.combined_score * 100).toFixed(1);
          const preview = memory.content.length > 70
            ? memory.content.substring(0, 70) + '...'
            : memory.content;

          console.log(`[${memory.id.substring(0, 8)}] score: ${score}%`);
          console.log(`  ${preview}`);
          console.log(`  ${date} | similarity: ${similarity}% | salience: ${salience}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to search memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * context - Get context package for AI (Slice 3)
 */
program
  .command('context')
  .description('Get context package for AI consumption')
  .option('-p, --profile <name>', 'Context profile (general, work, personal, creative)')
  .option('-q, --query <query>', 'Focus context on this query')
  .option('-t, --max-tokens <tokens>', 'Maximum tokens in output')
  .option('--json', 'Output as JSON instead of markdown')
  .action(async (options: { profile?: string; query?: string; maxTokens?: string; json?: boolean }) => {
    try {
      const maxTokens = options.maxTokens ? parseInt(options.maxTokens, 10) : undefined;

      const contextPackage = await generateContext({
        profile: options.profile,
        query: options.query,
        maxTokens,
      });

      if (options.json) {
        console.log(JSON.stringify(contextPackage.json, null, 2));
      } else {
        console.log('');
        console.log(contextPackage.markdown);
        console.log(`---`);
        console.log(`Tokens: ~${contextPackage.token_count} | Memories: ${contextPackage.memories.length} | Disclosure: ${contextPackage.disclosure_id.substring(0, 8)}`);
        console.log('');
      }
    } catch (error) {
      console.error('Failed to get context:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * profiles - List available context profiles
 */
program
  .command('profiles')
  .description('List available context profiles')
  .action(async () => {
    try {
      const profiles = await listProfiles();

      console.log('\nContext Profiles:\n');

      for (const profile of profiles) {
        const defaultTag = profile.is_default ? ' (default)' : '';
        const weights = profile.scoring_weights as { salience: number; relevance: number; recency: number; strength: number };

        console.log(`  ${profile.name}${defaultTag}`);
        console.log(`    ${profile.description || 'No description'}`);
        console.log(`    min_salience: ${profile.min_salience} | max_tokens: ${profile.max_tokens}`);
        console.log(`    weights: sal=${weights.salience} rel=${weights.relevance} rec=${weights.recency} str=${weights.strength}`);
        console.log('');
      }
    } catch (error) {
      console.error('Failed to list profiles:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * entities - List extracted entities
 */
program
  .command('entities')
  .description('List extracted entities (people, projects, etc.)')
  .option('-t, --type <type>', 'Filter by type (person, project, concept, place, organization)')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('-s, --search <query>', 'Search by name')
  .action(async (options: { type?: string; limit: string; search?: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const type = options.type as EntityType | undefined;

      const [entities, counts] = await Promise.all([
        listEntities({ type, limit, search: options.search }),
        countEntitiesByType(),
      ]);

      const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

      console.log('\nEntities\n');
      console.log(`  Total: ${totalCount}`);
      console.log(`  By type: person=${counts.person} project=${counts.project} place=${counts.place} org=${counts.organization} concept=${counts.concept}`);
      console.log('');

      if (entities.length === 0) {
        console.log('  No entities found.');
        console.log('  Entities are extracted automatically when you observe memories.');
      } else {
        for (const entity of entities) {
          const lastSeen = new Date(entity.last_seen_at).toLocaleDateString();
          console.log(`  [${entity.entity_type}] ${entity.name}`);
          console.log(`    mentions: ${entity.mention_count} | last seen: ${lastSeen}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to list entities:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * who - Query everything about a person/entity
 */
program
  .command('who')
  .description('What do I know about a person or entity?')
  .argument('<name>', 'Name to search for')
  .action(async (name: string) => {
    try {
      const result = await findEntityByName(name);

      if (!result) {
        console.log(`\nNo entity found matching "${name}"`);
        console.log('Try `squire entities` to see all known entities.');
        return;
      }

      console.log(`\n${result.name}`);
      console.log(`  Type: ${result.entity_type}`);
      console.log(`  Mentions: ${result.mention_count}`);
      console.log(`  First seen: ${new Date(result.first_seen_at).toLocaleDateString()}`);
      console.log(`  Last seen: ${new Date(result.last_seen_at).toLocaleDateString()}`);

      if (result.memories.length > 0) {
        console.log('\nRelated Memories:\n');

        for (const mem of result.memories.slice(0, 10)) {
          const date = new Date(mem.created_at).toLocaleDateString();
          const preview = mem.content.length > 70
            ? mem.content.substring(0, 70) + '...'
            : mem.content;

          console.log(`  [${mem.id.substring(0, 8)}] ${date}`);
          console.log(`    ${preview}`);
          console.log(`    salience: ${mem.salience_score}`);
          console.log('');
        }

        if (result.memories.length > 10) {
          console.log(`  ... and ${result.memories.length - 10} more memories`);
        }
      }
    } catch (error) {
      console.error('Failed to query entity:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * status - Check system health
 */
program
  .command('status')
  .description('Check system health and connection')
  .action(async () => {
    try {
      console.log('\nSquire Status\n');

      const [dbConnected, embeddingConnected, llmConnected] = await Promise.all([
        checkConnection(),
        checkEmbeddingHealth(),
        checkLLMHealth(),
      ]);

      const llmInfo = getLLMInfo();

      console.log(`  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`  Embedding: ${embeddingConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`    Provider: ${config.embedding.provider}`);
      console.log(`    Model: ${config.embedding.model}`);
      console.log(`    Dimension: ${config.embedding.dimension}`);
      console.log(`  LLM: ${llmConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`    Provider: ${llmInfo.provider}`);
      console.log(`    Model: ${llmInfo.model}`);
      console.log(`    Configured: ${llmInfo.configured ? 'Yes' : 'No (set GROQ_API_KEY)'}`);

      if (dbConnected) {
        const [total, entityCounts, consolidationStats, edgeStats, summaryStats] = await Promise.all([
          countMemories(),
          countEntitiesByType(),
          getConsolidationStats(),
          getEdgeStats(),
          getSummaryStats(),
        ]);
        const entityTotal = Object.values(entityCounts).reduce((a, b) => a + b, 0);
        console.log(`  Memories: ${total} (${consolidationStats.activeMemories} active, ${consolidationStats.dormantMemories} dormant)`);
        console.log(`  Entities: ${entityTotal}`);
        console.log(`  Edges: ${edgeStats.total} SIMILAR connections`);
        console.log(`  Summaries: ${summaryStats.withContent}/${summaryStats.categories} (${summaryStats.pendingMemories} pending)`);
      }

      console.log('');
    } catch (error) {
      console.error('Failed to check status:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * consolidate - Run memory consolidation (decay, strengthen, edges)
 */
program
  .command('consolidate')
  .description('Run memory consolidation (decay, strengthen, form connections)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { verbose?: boolean }) => {
    try {
      console.log('\nRunning consolidation...\n');

      const result = await consolidateAll();

      console.log('Consolidation complete!');
      console.log(`  Memories processed: ${result.memoriesProcessed}`);
      console.log(`  Decayed: ${result.memoriesDecayed}`);
      console.log(`  Strengthened: ${result.memoriesStrengthened}`);
      console.log(`  Edges created: ${result.edgesCreated}`);
      console.log(`  Edges reinforced: ${result.edgesReinforced}`);
      console.log(`  Edges pruned: ${result.edgesPruned}`);
      console.log(`  Patterns: ${result.patternsCreated} new, ${result.patternsReinforced} reinforced`);
      if (result.patternsDormant > 0) {
        console.log(`  Patterns dormant: ${result.patternsDormant}`);
      }
      console.log(`  Insights: ${result.insightsCreated} new, ${result.insightsValidated} validated`);
      if (result.insightsStale > 0) {
        console.log(`  Insights stale: ${result.insightsStale}`);
      }
      if (result.gapsCreated > 0 || result.gapsSurfaced > 0) {
        console.log(`  Gaps: ${result.gapsCreated} new, ${result.gapsSurfaced} surfaced`);
      }
      if (result.questionsCreated > 0 || result.questionsExpired > 0) {
        console.log(`  Questions: ${result.questionsCreated} new, ${result.questionsExpired} expired`);
      }
      console.log(`  Duration: ${result.durationMs}ms`);

      if (options.verbose) {
        const stats = await getConsolidationStats();
        console.log('\nCurrent State:');
        console.log(`  Active memories: ${stats.activeMemories}`);
        console.log(`  Dormant memories: ${stats.dormantMemories}`);
        console.log(`  Total edges: ${stats.totalEdges}`);
        console.log(`  Average edge weight: ${stats.averageWeight.toFixed(2)}`);
      }

      console.log('');
    } catch (error) {
      console.error('Consolidation failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * sleep - Friendly alias for consolidate
 */
program
  .command('sleep')
  .description('Let Squire consolidate memories (alias for consolidate)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { verbose?: boolean }) => {
    try {
      console.log('\nSquire is sleeping... consolidating memories...\n');

      const result = await consolidateAll();

      console.log('Squire wakes up refreshed!');
      console.log(`  Processed ${result.memoriesProcessed} memories`);
      console.log(`  ${result.memoriesDecayed} faded, ${result.memoriesStrengthened} strengthened`);
      console.log(`  ${result.edgesCreated} new connections formed`);
      if (result.patternsCreated > 0 || result.patternsReinforced > 0) {
        console.log(`  ${result.patternsCreated} patterns discovered, ${result.patternsReinforced} reinforced`);
      }
      if (result.insightsCreated > 0 || result.insightsValidated > 0) {
        console.log(`  ${result.insightsCreated} insights generated, ${result.insightsValidated} validated`);
      }
      if (result.gapsCreated > 0 || result.questionsCreated > 0) {
        console.log(`  ${result.gapsCreated} gaps found, ${result.questionsCreated} questions generated`);
      }

      if (options.verbose) {
        console.log(`  ${result.edgesReinforced} connections reinforced`);
        console.log(`  ${result.edgesPruned} weak connections pruned`);
      }

      console.log('');
    } catch (error) {
      console.error('Sleep failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * related - Show memories connected via SIMILAR edges
 */
program
  .command('related')
  .description('Show memories connected to a given memory')
  .argument('<memory-id>', 'Memory ID (can be partial)')
  .option('-l, --limit <limit>', 'Maximum number of related memories', '10')
  .action(async (memoryId: string, options: { limit: string }) => {
    try {
      const limit = parseInt(options.limit, 10);

      // Allow partial IDs - find the full ID
      let fullId = memoryId;
      if (memoryId.length < 36) {
        const memory = await getMemory(memoryId);
        if (!memory) {
          // Try to find by prefix
          console.log(`\nLooking for memory starting with "${memoryId}"...`);
          console.log('Use `squire list` to see available memories.');
          return;
        }
        fullId = memory.id;
      }

      const memory = await getMemory(fullId);
      if (!memory) {
        console.log(`\nMemory not found: ${memoryId}`);
        return;
      }

      console.log(`\nMemory: ${memory.id.substring(0, 8)}`);
      console.log(`  ${memory.content.length > 60 ? memory.content.substring(0, 60) + '...' : memory.content}`);
      console.log(`  salience: ${memory.salience_score} | strength: ${memory.current_strength.toFixed(2)}`);

      const related = await getRelatedMemories(fullId, { limit });

      if (related.length === 0) {
        console.log('\nNo connected memories found.');
        console.log('Run `squire consolidate` to form connections between similar memories.');
      } else {
        console.log(`\nConnected Memories (${related.length}):\n`);

        for (const mem of related) {
          const preview = mem.content.length > 60
            ? mem.content.substring(0, 60) + '...'
            : mem.content;
          const similarity = mem.edge_similarity ? (mem.edge_similarity * 100).toFixed(0) : '?';

          console.log(`  [${mem.id.substring(0, 8)}] weight: ${mem.edge_weight.toFixed(2)} | similarity: ${similarity}%`);
          console.log(`    ${preview}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to get related memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * import - Import memories from JSON file
 */
program
  .command('import')
  .description('Import memories from a JSON file (JSONL or array format)')
  .argument('<file>', 'Path to JSON file containing memories')
  .option('--allow-duplicates', 'Import even if similar content exists')
  .option('--skip-entities', 'Skip entity extraction (faster)')
  .option('--min-length <chars>', 'Minimum content length to import', '10')
  .option('--dry-run', 'Show what would be imported without importing')
  .option('-q, --quiet', 'Only show summary, not each memory')
  .action(async (
    file: string,
    options: {
      allowDuplicates?: boolean;
      skipEntities?: boolean;
      minLength: string;
      dryRun?: boolean;
      quiet?: boolean;
    }
  ) => {
    try {
      // Read and parse the file
      console.log(`\nReading ${file}...`);
      const content = readFileSync(file, 'utf-8');
      const memories = parseImportFile(content);

      console.log(`Found ${memories.length} memories to import\n`);

      if (memories.length === 0) {
        console.log('No valid memories found in file.');
        console.log('Expected format: JSONL or JSON array with { content, occurred_at?, source?, tags? }');
        return;
      }

      // Show preview in dry-run mode
      if (options.dryRun) {
        console.log('DRY RUN - would import:\n');
        for (const mem of memories.slice(0, 10)) {
          const date = mem.occurred_at
            ? new Date(mem.occurred_at).toLocaleDateString()
            : 'no date';
          const tags = mem.tags?.join(', ') || 'no tags';
          const preview = mem.content.length > 70
            ? mem.content.substring(0, 70) + '...'
            : mem.content;

          console.log(`  [${date}] ${preview}`);
          console.log(`    source: ${mem.source || 'import'} | tags: ${tags}`);
          console.log('');
        }
        if (memories.length > 10) {
          console.log(`  ... and ${memories.length - 10} more`);
        }
        return;
      }

      // Import with progress
      const minLength = parseInt(options.minLength, 10);
      const result = await importMemories(memories, {
        allowDuplicates: options.allowDuplicates,
        skipEntities: options.skipEntities,
        minLength,
        onProgress: options.quiet ? undefined : (current, total, preview) => {
          process.stdout.write(`\r  [${current}/${total}] ${preview.padEnd(60)}`);
        },
      });

      if (!options.quiet) {
        console.log('\n');
      }

      // Show results
      console.log('Import complete!\n');
      console.log(`  Total in file: ${result.total}`);
      console.log(`  Imported: ${result.imported}`);
      console.log(`  Skipped: ${result.skipped} (duplicates or too short)`);
      console.log(`  Errors: ${result.errors}`);

      if (result.imported > 0 && !options.quiet) {
        console.log('\nSample imported memories:\n');
        for (const mem of result.memories.slice(0, 5)) {
          console.log(`  [${mem.id.substring(0, 8)}] salience: ${mem.salience.toFixed(1)} | entities: ${mem.entities}`);
          console.log(`    ${mem.content}...`);
          console.log('');
        }
        if (result.memories.length > 5) {
          console.log(`  ... and ${result.memories.length - 5} more`);
        }
      }

      if (result.errors > 0) {
        console.log('\nErrors:');
        for (const err of result.errorDetails.slice(0, 5)) {
          console.log(`  ${err}`);
        }
      }

      console.log('\nRun `squire consolidate` to form connections between memories.');
      console.log('');
    } catch (error) {
      console.error('Failed to import:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * import-stats - Show import statistics
 */
program
  .command('import-stats')
  .description('Show statistics about imported memories')
  .action(async () => {
    try {
      const stats = await getImportStats();

      console.log('\nImport Statistics\n');
      console.log(`  Total imported: ${stats.totalImported}`);

      if (Object.keys(stats.bySources).length > 0) {
        console.log('\n  By source:');
        for (const [source, count] of Object.entries(stats.bySources)) {
          console.log(`    ${source}: ${count}`);
        }
      }

      if (stats.dateRange.oldest) {
        console.log('\n  Date range:');
        console.log(`    Oldest: ${stats.dateRange.oldest.toLocaleDateString()}`);
        console.log(`    Newest: ${stats.dateRange.newest?.toLocaleDateString()}`);
      }

      console.log('');
    } catch (error) {
      console.error('Failed to get import stats:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * summary - Show a living summary by category
 */
program
  .command('summary')
  .description('Show a living summary by category')
  .argument('<category>', `Category: ${SUMMARY_CATEGORIES.join(', ')}`)
  .option('-r, --regenerate', 'Regenerate the summary from pending memories')
  .action(async (category: string, options: { regenerate?: boolean }) => {
    try {
      if (!isValidCategory(category)) {
        console.log(`\nInvalid category: "${category}"`);
        console.log(`Valid categories: ${SUMMARY_CATEGORIES.join(', ')}`);
        return;
      }

      if (options.regenerate) {
        console.log(`\nRegenerating ${category} summary...`);
        const result = await generateSummary(category as SummaryCategory);

        if (result.memoriesProcessed === 0) {
          console.log('No new memories to incorporate.');
        } else {
          console.log(`Incorporated ${result.memoriesProcessed} new memories.`);
        }
        console.log('');
      }

      const summary = await getSummary(category as SummaryCategory);
      if (!summary) {
        console.log(`\nSummary not found: ${category}`);
        return;
      }

      console.log(`\n${category.toUpperCase()}`);
      console.log(`${'─'.repeat(40)}`);

      if (!summary.content) {
        console.log('No summary yet. Add memories and run regeneration.');
        console.log(`\nTry: squire summary ${category} --regenerate`);
      } else {
        console.log(summary.content);
      }

      console.log(`${'─'.repeat(40)}`);
      console.log(`Version: ${summary.version} | Memories: ${summary.memory_count} | Last updated: ${summary.last_updated_at.toLocaleString()}`);
      console.log('');
    } catch (error) {
      console.error('Failed to get summary:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * summaries - List all living summaries
 */
program
  .command('summaries')
  .description('List all living summaries')
  .option('-a, --all', 'Show all categories including empty ones')
  .option('-r, --regenerate', 'Regenerate all summaries with pending memories')
  .action(async (options: { all?: boolean; regenerate?: boolean }) => {
    try {
      if (options.regenerate) {
        console.log('\nUpdating all summaries with pending memories...\n');
        const result = await updateAllSummaries();

        if (result.updated.length === 0) {
          console.log('No summaries needed updating.');
        } else {
          console.log(`Updated ${result.updated.length} summaries:`);
          for (const cat of result.updated) {
            console.log(`  - ${cat}`);
          }
          console.log(`\nTotal memories processed: ${result.memoriesProcessed}`);
        }
        console.log('');
      }

      const summaries = await getAllSummaries();
      const stats = await getSummaryStats();

      console.log('\nLiving Summaries\n');
      console.log(`  Categories: ${stats.categories}`);
      console.log(`  With content: ${stats.withContent}`);
      console.log(`  Pending memories: ${stats.pendingMemories}`);
      console.log('');

      for (const summary of summaries) {
        if (!options.all && !summary.content) continue;

        const preview = summary.content
          ? (summary.content.length > 80 ? summary.content.substring(0, 80) + '...' : summary.content)
          : '(empty)';
        const stale = summary.staleness_score > 0.3 ? ' [stale]' : '';

        console.log(`  ${summary.category}${stale}`);
        console.log(`    ${preview}`);
        console.log(`    v${summary.version} | ${summary.memory_count} memories | ${summary.last_updated_at.toLocaleDateString()}`);
        console.log('');
      }

      if (stats.pendingMemories > 0) {
        console.log(`Run 'squire summaries --regenerate' to incorporate ${stats.pendingMemories} pending memories.`);
        console.log('');
      }
    } catch (error) {
      console.error('Failed to list summaries:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * classify - Classify a memory into categories (for debugging/testing)
 */
program
  .command('classify')
  .description('Classify text into summary categories (for testing)')
  .argument('<content>', 'Content to classify')
  .action(async (content: string) => {
    try {
      console.log(`\nClassifying: "${content.substring(0, 60)}${content.length > 60 ? '...' : ''}"\n`);

      const classifications = await classifyMemoryCategories(content);

      if (classifications.length === 0) {
        console.log('No categories detected for this content.');
      } else {
        console.log('Categories:');
        for (const c of classifications) {
          const relevance = (c.relevance * 100).toFixed(0);
          console.log(`  ${c.category}: ${relevance}%`);
          if (c.reason) {
            console.log(`    ${c.reason}`);
          }
        }
      }
      console.log('');
    } catch (error) {
      console.error('Classification failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * backfill-summaries - Classify existing memories for summaries
 */
program
  .command('backfill-summaries')
  .description('Classify existing memories into summary categories')
  .option('-l, --limit <limit>', 'Maximum number of memories to process', '50')
  .option('--dry-run', 'Show what would be classified without doing it')
  .action(async (options: { limit: string; dryRun?: boolean }) => {
    try {
      const limit = parseInt(options.limit, 10);

      // Find memories not yet linked to any summary
      const result = await pool.query<{ id: string; content: string }>(
        `SELECT m.id, m.content FROM memories m
         WHERE NOT EXISTS (
           SELECT 1 FROM memory_summary_links msl WHERE msl.memory_id = m.id
         )
         ORDER BY m.created_at DESC
         LIMIT $1`,
        [limit]
      );

      const unclassified = result.rows;

      console.log(`\nFound ${unclassified.length} unclassified memories.\n`);

      if (unclassified.length === 0) {
        console.log('All memories are already classified.');
        return;
      }

      if (options.dryRun) {
        console.log('DRY RUN - would classify:');
        for (const mem of unclassified.slice(0, 10)) {
          const preview = mem.content.length > 60
            ? mem.content.substring(0, 60) + '...'
            : mem.content;
          console.log(`  ${mem.id.substring(0, 8)}: ${preview}`);
        }
        if (unclassified.length > 10) {
          console.log(`  ... and ${unclassified.length - 10} more`);
        }
        return;
      }

      console.log('Classifying memories...\n');

      let classified = 0;
      let totalCategories = 0;

      for (const mem of unclassified) {
        const preview = mem.content.length > 40
          ? mem.content.substring(0, 40) + '...'
          : mem.content;
        process.stdout.write(`\r  [${classified + 1}/${unclassified.length}] ${preview.padEnd(45)}`);

        const classifications = await classifyMemoryCategories(mem.content);
        if (classifications.length > 0) {
          await linkMemoryToCategories(mem.id, classifications);
          totalCategories += classifications.length;
        }
        classified++;
      }

      console.log(`\n\nBackfill complete!`);
      console.log(`  Memories classified: ${classified}`);
      console.log(`  Category links created: ${totalCategories}`);
      console.log(`\nRun 'squire summaries --regenerate' to update summaries.`);
      console.log('');
    } catch (error) {
      console.error('Backfill failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * reclassify-identity - Reclassify memories that mention the user by name
 * One-time migration for memories created before identity-first classification fix
 */
program
  .command('reclassify-identity')
  .description('Reclassify memories mentioning user by name (one-time migration)')
  .option('-n, --name <name>', 'User name to search for', process.env.USER_NAME || '')
  .option('-l, --limit <limit>', 'Maximum memories to process', '100')
  .option('--dry-run', 'Show what would be reclassified without doing it')
  .option('--regenerate', 'Also regenerate personality summary after reclassification')
  .action(async (options: { name: string; limit: string; dryRun?: boolean; regenerate?: boolean }) => {
    try {
      const name = options.name;
      const limit = parseInt(options.limit, 10);

      console.log(`\n🔍 Searching for memories mentioning "${name}"...\n`);

      // Find memories mentioning the name that aren't linked to personality
      const result = await pool.query<{ id: string; content: string; categories: string | null }>(
        `SELECT
          m.id,
          m.content,
          STRING_AGG(msl.summary_category, ', ') as categories
        FROM memories m
        LEFT JOIN memory_summary_links msl ON m.id = msl.memory_id
        WHERE m.content ILIKE $1
        GROUP BY m.id, m.content
        HAVING NOT EXISTS (
          SELECT 1 FROM memory_summary_links msl2
          WHERE msl2.memory_id = m.id
          AND msl2.summary_category = 'personality'
        )
        ORDER BY m.created_at DESC
        LIMIT $2`,
        [`%${name}%`, limit]
      );

      const memories = result.rows;

      if (memories.length === 0) {
        console.log(`✅ No memories mentioning "${name}" need reclassification.`);
        console.log('   All relevant memories are already linked to personality.\n');
        return;
      }

      console.log(`Found ${memories.length} memories mentioning "${name}" not linked to personality:\n`);

      for (const mem of memories) {
        const preview = mem.content.length > 60
          ? mem.content.substring(0, 60) + '...'
          : mem.content;
        const existing = mem.categories || '(none)';
        console.log(`  📝 ${mem.id.substring(0, 8)}: ${preview}`);
        console.log(`     Current categories: ${existing}`);
      }

      if (options.dryRun) {
        console.log('\n🔶 DRY RUN - no changes made.');
        console.log(`   Run without --dry-run to reclassify these memories.\n`);
        return;
      }

      console.log('\n🔄 Reclassifying memories...\n');

      let reclassified = 0;
      let newLinks = 0;

      for (const mem of memories) {
        const preview = mem.content.length > 40
          ? mem.content.substring(0, 40) + '...'
          : mem.content;
        process.stdout.write(`\r  [${reclassified + 1}/${memories.length}] ${preview.padEnd(45)}`);

        // Re-run classification with enhanced identity detection
        const classifications = await classifyMemoryCategories(mem.content);
        if (classifications.length > 0) {
          await linkMemoryToCategories(mem.id, classifications);
          newLinks += classifications.length;
        }
        reclassified++;
      }

      console.log(`\n\n✅ Reclassification complete!`);
      console.log(`   Memories processed: ${reclassified}`);
      console.log(`   Category links created/updated: ${newLinks}`);

      // Optionally regenerate personality summary
      if (options.regenerate) {
        console.log('\n🔄 Regenerating personality summary...');
        const genResult = await generateSummary('personality');
        console.log(`   ✅ Personality summary updated (v${genResult.summary.version})`);
        console.log(`   Memories incorporated: ${genResult.memoriesProcessed}`);
      } else {
        console.log(`\n💡 Run 'squire summary personality --regenerate' to update the personality summary.`);
      }

      console.log('');
    } catch (error) {
      console.error('Reclassification failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * beliefs - List all beliefs
 */
program
  .command('beliefs')
  .description('List extracted beliefs')
  .option('-t, --type <type>', 'Filter by belief type')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('--conflicts', 'Show unresolved conflicts only')
  .action(async (options: { type?: string; limit: string; conflicts?: boolean }) => {
    try {
      // Show conflicts if requested
      if (options.conflicts) {
        const conflicts = await getUnresolvedConflicts();

        console.log(`\nUnresolved Belief Conflicts (${conflicts.length})\n`);

        if (conflicts.length === 0) {
          console.log('No unresolved conflicts.');
        } else {
          for (const c of conflicts) {
            console.log(`[${c.id.substring(0, 8)}] ${c.conflict_type}`);
            console.log(`  A: "${c.belief_a_content}"`);
            console.log(`  B: "${c.belief_b_content}"`);
            if (c.conflict_description) {
              console.log(`  ${c.conflict_description}`);
            }
            console.log('');
          }
        }
        return;
      }

      // Validate type if provided
      if (options.type && !isValidBeliefType(options.type)) {
        console.log(`\nInvalid belief type: ${options.type}`);
        console.log(`Valid types: ${BELIEF_TYPES.join(', ')}`);
        return;
      }

      const limit = parseInt(options.limit, 10);
      const beliefs = await getAllBeliefs({
        type: options.type as BeliefType | undefined,
        limit,
      });

      const stats = await getBeliefStats();

      console.log('\nBeliefs\n');
      console.log(`  Total: ${stats.total} | Active: ${stats.active} | Conflicted: ${stats.conflicted}`);
      if (stats.unresolvedConflicts > 0) {
        console.log(`  ⚠ ${stats.unresolvedConflicts} unresolved conflict(s)`);
      }
      console.log('');

      if (beliefs.length === 0) {
        console.log('No beliefs extracted yet.');
        console.log('Beliefs are extracted automatically when you observe memories.');
      } else {
        for (const b of beliefs) {
          const conf = (b.confidence * 100).toFixed(0);
          const status = b.status !== 'active' ? ` [${b.status}]` : '';
          console.log(`[${b.id.substring(0, 8)}] ${b.belief_type}${status}`);
          console.log(`  "${b.content}"`);
          console.log(`  confidence: ${conf}% | sources: ${b.source_memory_count} | reinforced: ${b.reinforcement_count}x`);
          console.log('');
        }
      }

      if (options.type) {
        console.log(`Showing ${options.type} beliefs only. Remove --type to see all.`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list beliefs:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * belief - Show a specific belief with evidence
 */
program
  .command('belief')
  .description('Show a specific belief with its evidence')
  .argument('<id>', 'Belief ID (can be partial)')
  .action(async (id: string) => {
    try {
      // Try to find by partial ID
      let belief = null;

      if (id.length === 36) {
        belief = await getBelief(id);
      } else {
        // Search for partial match
        const all = await getAllBeliefs({ limit: 100 });
        const match = all.find(b => b.id.startsWith(id));
        if (match) {
          belief = match;
        }
      }

      if (!belief) {
        console.log(`\nBelief not found: ${id}`);
        console.log('Use `squire beliefs` to see available beliefs.');
        return;
      }

      const evidence = await getBeliefEvidence(belief.id);

      console.log(`\nBelief: ${belief.id}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`"${belief.content}"`);
      console.log('');
      console.log(`  Type: ${belief.belief_type} (${getBeliefTypeDescription(belief.belief_type)})`);
      console.log(`  Status: ${belief.status}`);
      console.log(`  Confidence: ${(belief.confidence * 100).toFixed(0)}%`);
      console.log(`  Reinforced: ${belief.reinforcement_count} times`);
      console.log(`  First seen: ${belief.first_extracted_at.toLocaleString()}`);
      if (belief.last_reinforced_at) {
        console.log(`  Last reinforced: ${belief.last_reinforced_at.toLocaleString()}`);
      }
      console.log('');

      if (evidence.length > 0) {
        console.log(`Evidence (${evidence.length} memories):`);
        for (const e of evidence) {
          const strength = (e.support_strength * 100).toFixed(0);
          const preview = e.memory_content.length > 60
            ? e.memory_content.substring(0, 60) + '...'
            : e.memory_content;
          console.log(`  [${e.memory_id.substring(0, 8)}] ${e.evidence_type} (${strength}%)`);
          console.log(`    ${preview}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to get belief:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * patterns - List all patterns
 */
program
  .command('patterns')
  .description('List detected patterns')
  .option('-t, --type <type>', 'Filter by pattern type')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('--dormant', 'Include dormant patterns')
  .action(async (options: { type?: string; limit: string; dormant?: boolean }) => {
    try {
      // Validate type if provided
      if (options.type && !isValidPatternType(options.type)) {
        console.log(`\nInvalid pattern type: ${options.type}`);
        console.log(`Valid types: ${PATTERN_TYPES.join(', ')}`);
        return;
      }

      const limit = parseInt(options.limit, 10);
      const patterns = await getAllPatterns({
        type: options.type as PatternType | undefined,
        status: options.dormant ? undefined : 'active',
        limit,
      });

      const stats = await getPatternStats();

      console.log('\nPatterns\n');
      console.log(`  Total: ${stats.total} | Active: ${stats.active} | Dormant: ${stats.dormant}`);
      console.log(`  Avg confidence: ${(stats.avgConfidence * 100).toFixed(0)}% | Avg frequency: ${(stats.avgFrequency * 100).toFixed(0)}%`);
      console.log('');

      if (patterns.length === 0) {
        console.log('No patterns detected yet.');
        console.log('Patterns are detected during consolidation. Run `squire consolidate`.');
      } else {
        for (const p of patterns) {
          const conf = (p.confidence * 100).toFixed(0);
          const freq = (p.frequency * 100).toFixed(0);
          const status = p.status !== 'active' ? ` [${p.status}]` : '';
          const time = p.time_of_day ? ` (${p.time_of_day})` : '';
          const day = p.day_of_week ? ` (${p.day_of_week})` : '';
          console.log(`[${p.id.substring(0, 8)}] ${p.pattern_type}${status}`);
          console.log(`  "${p.content}"`);
          console.log(`  confidence: ${conf}% | frequency: ${freq}% | sources: ${p.source_memory_count}${time}${day}`);
          console.log('');
        }
      }

      if (options.type) {
        console.log(`Showing ${options.type} patterns only. Remove --type to see all.`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list patterns:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * pattern - Show a specific pattern with evidence
 */
program
  .command('pattern')
  .description('Show a specific pattern with its evidence')
  .argument('<id>', 'Pattern ID (can be partial)')
  .action(async (id: string) => {
    try {
      // Try to find by partial ID
      let pattern = null;

      if (id.length === 36) {
        pattern = await getPattern(id);
      } else {
        // Search for partial match
        const all = await getAllPatterns({ limit: 100 });
        const match = all.find(p => p.id.startsWith(id));
        if (match) {
          pattern = match;
        }
      }

      if (!pattern) {
        console.log(`\nPattern not found: ${id}`);
        console.log('Use `squire patterns` to see available patterns.');
        return;
      }

      const evidence = await getPatternEvidence(pattern.id);

      console.log(`\nPattern: ${pattern.id}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`"${pattern.content}"`);
      console.log('');
      console.log(`  Type: ${pattern.pattern_type} (${getPatternTypeDescription(pattern.pattern_type)})`);
      console.log(`  Status: ${pattern.status}`);
      console.log(`  Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
      console.log(`  Frequency: ${(pattern.frequency * 100).toFixed(0)}%`);
      console.log(`  Observed: ${pattern.observation_count} times`);
      console.log(`  First seen: ${pattern.first_detected_at.toLocaleString()}`);
      if (pattern.last_observed_at) {
        console.log(`  Last observed: ${pattern.last_observed_at.toLocaleString()}`);
      }
      if (pattern.time_of_day) {
        console.log(`  Time of day: ${pattern.time_of_day}`);
      }
      if (pattern.day_of_week) {
        console.log(`  Day of week: ${pattern.day_of_week}`);
      }
      console.log('');

      if (evidence.length > 0) {
        console.log(`Evidence (${evidence.length} memories):`);
        for (const e of evidence) {
          const strength = (e.evidence_strength * 100).toFixed(0);
          const preview = e.memory_content.length > 60
            ? e.memory_content.substring(0, 60) + '...'
            : e.memory_content;
          console.log(`  [${e.memory_id.substring(0, 8)}] ${e.evidence_type} (${strength}%)`);
          console.log(`    ${preview}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to get pattern:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * insights - List all insights
 */
program
  .command('insights')
  .description('List generated insights')
  .option('-t, --type <type>', 'Filter by insight type (connection, contradiction, opportunity, warning)')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('--all', 'Include dismissed and actioned insights')
  .action(async (options: { type?: string; priority?: string; limit: string; all?: boolean }) => {
    try {
      // Validate type if provided
      if (options.type && !isValidInsightType(options.type)) {
        console.log(`\nInvalid insight type: ${options.type}`);
        console.log(`Valid types: ${INSIGHT_TYPES.join(', ')}`);
        return;
      }

      // Validate priority if provided
      if (options.priority && !INSIGHT_PRIORITIES.includes(options.priority as InsightPriority)) {
        console.log(`\nInvalid priority: ${options.priority}`);
        console.log(`Valid priorities: ${INSIGHT_PRIORITIES.join(', ')}`);
        return;
      }

      const limit = parseInt(options.limit, 10);
      const insights = await getAllInsights({
        type: options.type as InsightType | undefined,
        priority: options.priority as InsightPriority | undefined,
        status: options.all ? undefined : 'active',
        limit,
      });

      const stats = await getInsightStats();

      console.log('\nInsights\n');
      console.log(`  Total: ${stats.total} | Active: ${stats.active} | Actioned: ${stats.actioned} | Dismissed: ${stats.dismissed}`);
      console.log(`  Avg confidence: ${(stats.avgConfidence * 100).toFixed(0)}%`);
      console.log('');

      if (insights.length === 0) {
        console.log('No insights generated yet.');
        console.log('Insights are generated during consolidation. Run `squire consolidate`.');
      } else {
        for (const i of insights) {
          const conf = (i.confidence * 100).toFixed(0);
          const status = i.status !== 'active' ? ` [${i.status}]` : '';
          const emoji = getInsightTypeEmoji(i.insight_type);
          const priorityEmoji = getPriorityEmoji(i.priority);
          console.log(`${priorityEmoji} [${i.id.substring(0, 8)}] ${emoji} ${i.insight_type}${status}`);
          console.log(`  "${i.content}"`);
          console.log(`  priority: ${i.priority} | confidence: ${conf}% | validated: ${i.validation_count}x`);
          console.log('');
        }
      }

      if (options.type) {
        console.log(`Showing ${options.type} insights only. Remove --type to see all.`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list insights:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * insight - Show a specific insight with sources
 */
program
  .command('insight')
  .description('Show a specific insight with its sources')
  .argument('<id>', 'Insight ID (can be partial)')
  .option('--dismiss [reason]', 'Dismiss this insight')
  .option('--action', 'Mark this insight as actioned')
  .action(async (id: string, options: { dismiss?: string | boolean; action?: boolean }) => {
    try {
      // Try to find by partial ID
      let insight = null;

      if (id.length === 36) {
        insight = await getInsight(id);
      } else {
        // Search for partial match
        const all = await getAllInsights({ limit: 100 });
        const match = all.find(i => i.id.startsWith(id));
        if (match) {
          insight = match;
        }
      }

      if (!insight) {
        console.log(`\nInsight not found: ${id}`);
        console.log('Use `squire insights` to see available insights.');
        return;
      }

      // Handle dismiss action
      if (options.dismiss !== undefined) {
        const reason = typeof options.dismiss === 'string' ? options.dismiss : undefined;
        await dismissInsight(insight.id, reason);
        console.log(`\nInsight dismissed: ${insight.id.substring(0, 8)}`);
        if (reason) {
          console.log(`  Reason: ${reason}`);
        }
        return;
      }

      // Handle action
      if (options.action) {
        await actionInsight(insight.id);
        console.log(`\nInsight marked as actioned: ${insight.id.substring(0, 8)}`);
        return;
      }

      const sources = await getInsightSources(insight.id);

      const emoji = getInsightTypeEmoji(insight.insight_type);
      console.log(`\n${emoji} Insight: ${insight.id}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`"${insight.content}"`);
      console.log('');
      console.log(`  Type: ${insight.insight_type} (${getInsightTypeDescription(insight.insight_type)})`);
      console.log(`  Priority: ${insight.priority}`);
      console.log(`  Status: ${insight.status}`);
      console.log(`  Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
      console.log(`  Validated: ${insight.validation_count} times`);
      console.log(`  Created: ${insight.created_at.toLocaleString()}`);
      if (insight.actioned_at) {
        console.log(`  Actioned: ${insight.actioned_at.toLocaleString()}`);
      }
      console.log('');

      if (sources.length > 0) {
        console.log(`Sources (${sources.length}):`);
        for (const s of sources) {
          const strength = (s.contribution_strength * 100).toFixed(0);
          const preview = s.source_content
            ? (s.source_content.length > 50 ? s.source_content.substring(0, 50) + '...' : s.source_content)
            : '(content unavailable)';
          console.log(`  [${s.source_type}] ${s.source_id.substring(0, 8)} - ${s.contribution_type} (${strength}%)`);
          console.log(`    ${preview}`);
          if (s.explanation) {
            console.log(`    ${s.explanation}`);
          }
        }
      }

      console.log('');
      console.log('Actions:');
      console.log(`  squire insight ${insight.id.substring(0, 8)} --dismiss "reason"  # Mark as not relevant`);
      console.log(`  squire insight ${insight.id.substring(0, 8)} --action           # Mark as acted upon`);
      console.log('');
    } catch (error) {
      console.error('Failed to get insight:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * gaps - List all knowledge gaps
 */
program
  .command('gaps')
  .description('List knowledge gaps (what we don\'t know)')
  .option('-t, --type <type>', 'Filter by gap type')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('--all', 'Include filled and dismissed gaps')
  .action(async (options: { type?: string; priority?: string; limit: string; all?: boolean }) => {
    try {
      // Validate type if provided
      if (options.type && !GAP_TYPES.includes(options.type as GapType)) {
        console.log(`\nInvalid gap type: ${options.type}`);
        console.log(`Valid types: ${GAP_TYPES.join(', ')}`);
        return;
      }

      // Validate priority if provided
      if (options.priority && !GAP_PRIORITIES.includes(options.priority as GapPriority)) {
        console.log(`\nInvalid priority: ${options.priority}`);
        console.log(`Valid priorities: ${GAP_PRIORITIES.join(', ')}`);
        return;
      }

      const limit = parseInt(options.limit, 10);
      const gaps = await getAllGaps({
        type: options.type as GapType | undefined,
        priority: options.priority as GapPriority | undefined,
        status: options.all ? undefined : 'open',
        limit,
      });

      const stats = await getGapStats();

      console.log('\nKnowledge Gaps\n');
      console.log(`  Total: ${stats.total} | Open: ${stats.open} | Partially filled: ${stats.partiallyFilled} | Filled: ${stats.filled}`);
      console.log(`  Avg severity: ${(stats.avgSeverity * 100).toFixed(0)}%`);
      console.log('');

      if (gaps.length === 0) {
        console.log('No knowledge gaps detected yet.');
        console.log('Gaps are detected during consolidation. Run `squire consolidate`.');
      } else {
        for (const g of gaps) {
          const severity = (g.severity * 100).toFixed(0);
          const status = g.status !== 'open' ? ` [${g.status}]` : '';
          const emoji = getGapTypeEmoji(g.gap_type);
          const surfaced = g.times_surfaced > 1 ? ` (surfaced ${g.times_surfaced}x)` : '';
          console.log(`${emoji} [${g.id.substring(0, 8)}] ${g.gap_type}${status}${surfaced}`);
          console.log(`  "${g.content}"`);
          console.log(`  priority: ${g.priority} | severity: ${severity}%`);
          console.log('');
        }
      }

      if (options.type) {
        console.log(`Showing ${options.type} gaps only. Remove --type to see all.`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list gaps:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * gap - Show a specific gap with sources
 */
program
  .command('gap')
  .description('Show a specific knowledge gap with its sources')
  .argument('<id>', 'Gap ID (can be partial)')
  .option('--dismiss [reason]', 'Dismiss this gap')
  .option('--fill', 'Mark this gap as filled')
  .action(async (id: string, options: { dismiss?: string | boolean; fill?: boolean }) => {
    try {
      // Try to find by partial ID
      let gap = null;

      if (id.length === 36) {
        gap = await getGap(id);
      } else {
        // Search for partial match
        const all = await getAllGaps({ limit: 100 });
        const match = all.find(g => g.id.startsWith(id));
        if (match) {
          gap = match;
        }
      }

      if (!gap) {
        console.log(`\nGap not found: ${id}`);
        console.log('Use `squire gaps` to see available gaps.');
        return;
      }

      // Handle dismiss action
      if (options.dismiss !== undefined) {
        const reason = typeof options.dismiss === 'string' ? options.dismiss : undefined;
        await dismissGap(gap.id, reason);
        console.log(`\nGap dismissed: ${gap.id.substring(0, 8)}`);
        if (reason) {
          console.log(`  Reason: ${reason}`);
        }
        return;
      }

      // Handle fill action
      if (options.fill) {
        await fillGap(gap.id);
        console.log(`\nGap marked as filled: ${gap.id.substring(0, 8)}`);
        return;
      }

      const sources = await getGapSources(gap.id);

      const emoji = getGapTypeEmoji(gap.gap_type);
      console.log(`\n${emoji} Gap: ${gap.id}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`"${gap.content}"`);
      console.log('');
      console.log(`  Type: ${gap.gap_type}`);
      console.log(`  Priority: ${gap.priority}`);
      console.log(`  Severity: ${(gap.severity * 100).toFixed(0)}%`);
      console.log(`  Status: ${gap.status}`);
      console.log(`  Times surfaced: ${gap.times_surfaced}`);
      console.log(`  Detected: ${gap.created_at.toLocaleString()}`);
      if (gap.detection_context) {
        console.log(`  Context: ${gap.detection_context}`);
      }
      console.log('');

      if (sources.length > 0) {
        console.log(`Sources (${sources.length}):`);
        for (const s of sources) {
          console.log(`  [${s.source_type}] ${s.source_id.substring(0, 8)} - ${s.revelation_type}`);
          if (s.explanation) {
            console.log(`    ${s.explanation}`);
          }
        }
      }

      console.log('');
      console.log('Actions:');
      console.log(`  squire gap ${gap.id.substring(0, 8)} --dismiss "reason"  # Not interested in filling`);
      console.log(`  squire gap ${gap.id.substring(0, 8)} --fill              # Mark as filled`);
      console.log('');
    } catch (error) {
      console.error('Failed to get gap:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * questions - List all research questions
 */
program
  .command('questions')
  .description('List research questions to ask')
  .option('-t, --type <type>', 'Filter by question type')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, critical)')
  .option('--timing <hint>', 'Filter by timing hint')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('--all', 'Include answered and dismissed questions')
  .action(async (options: { type?: string; priority?: string; timing?: string; limit: string; all?: boolean }) => {
    try {
      // Validate type if provided
      if (options.type && !QUESTION_TYPES.includes(options.type as QuestionType)) {
        console.log(`\nInvalid question type: ${options.type}`);
        console.log(`Valid types: ${QUESTION_TYPES.join(', ')}`);
        return;
      }

      // Validate priority if provided
      if (options.priority && !GAP_PRIORITIES.includes(options.priority as GapPriority)) {
        console.log(`\nInvalid priority: ${options.priority}`);
        console.log(`Valid priorities: ${GAP_PRIORITIES.join(', ')}`);
        return;
      }

      // Validate timing if provided
      if (options.timing && !TIMING_HINTS.includes(options.timing as TimingHint)) {
        console.log(`\nInvalid timing hint: ${options.timing}`);
        console.log(`Valid hints: ${TIMING_HINTS.join(', ')}`);
        return;
      }

      const limit = parseInt(options.limit, 10);
      const questions = await getAllQuestions({
        type: options.type as QuestionType | undefined,
        priority: options.priority as GapPriority | undefined,
        timingHint: options.timing as TimingHint | undefined,
        status: options.all ? undefined : 'pending',
        limit,
      });

      const stats = await getQuestionStats();

      console.log('\nResearch Questions\n');
      console.log(`  Total: ${stats.total} | Pending: ${stats.pending} | Asked: ${stats.asked} | Answered: ${stats.answered}`);
      if (stats.avgUsefulness > 0) {
        console.log(`  Avg usefulness: ${(stats.avgUsefulness * 100).toFixed(0)}%`);
      }
      console.log('');

      if (questions.length === 0) {
        console.log('No research questions generated yet.');
        console.log('Questions are generated during consolidation. Run `squire consolidate`.');
      } else {
        for (const q of questions) {
          const status = q.status !== 'pending' ? ` [${q.status}]` : '';
          const emoji = getQuestionTypeEmoji(q.question_type);
          const timing = q.timing_hint ? ` (${getTimingHintDescription(q.timing_hint)})` : '';
          console.log(`${emoji} [${q.id.substring(0, 8)}] ${q.question_type}${status}${timing}`);
          console.log(`  "${q.content}"`);
          console.log(`  priority: ${q.priority}`);
          console.log('');
        }
      }

      if (options.type) {
        console.log(`Showing ${options.type} questions only. Remove --type to see all.`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list questions:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * question - Show a specific question with sources
 */
program
  .command('question')
  .description('Show a specific research question')
  .argument('<id>', 'Question ID (can be partial)')
  .option('--ask', 'Mark this question as asked')
  .option('--answer <text>', 'Record an answer to this question')
  .option('--dismiss', 'Dismiss this question')
  .action(async (id: string, options: { ask?: boolean; answer?: string; dismiss?: boolean }) => {
    try {
      // Try to find by partial ID
      let question = null;

      if (id.length === 36) {
        question = await getQuestion(id);
      } else {
        // Search for partial match
        const all = await getAllQuestions({ limit: 100 });
        const match = all.find(q => q.id.startsWith(id));
        if (match) {
          question = match;
        }
      }

      if (!question) {
        console.log(`\nQuestion not found: ${id}`);
        console.log('Use `squire questions` to see available questions.');
        return;
      }

      // Handle ask action
      if (options.ask) {
        await askQuestion(question.id);
        console.log(`\nQuestion marked as asked: ${question.id.substring(0, 8)}`);
        return;
      }

      // Handle answer action
      if (options.answer) {
        await answerQuestion(question.id, options.answer);
        console.log(`\nAnswer recorded for: ${question.id.substring(0, 8)}`);
        return;
      }

      // Handle dismiss action
      if (options.dismiss) {
        await dismissQuestion(question.id);
        console.log(`\nQuestion dismissed: ${question.id.substring(0, 8)}`);
        return;
      }

      const sources = await getQuestionSources(question.id);

      const emoji = getQuestionTypeEmoji(question.question_type);
      console.log(`\n${emoji} Question: ${question.id}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`"${question.content}"`);
      console.log('');
      console.log(`  Type: ${question.question_type}`);
      console.log(`  Priority: ${question.priority}`);
      console.log(`  Status: ${question.status}`);
      if (question.timing_hint) {
        console.log(`  Timing: ${getTimingHintDescription(question.timing_hint)}`);
      }
      if (question.gap_id) {
        console.log(`  For gap: ${question.gap_id.substring(0, 8)}`);
      }
      console.log(`  Created: ${question.created_at.toLocaleString()}`);
      if (question.asked_at) {
        console.log(`  Asked: ${question.asked_at.toLocaleString()}`);
      }
      if (question.answered_at) {
        console.log(`  Answered: ${question.answered_at.toLocaleString()}`);
        if (question.answer) {
          console.log(`  Answer: "${question.answer}"`);
        }
      }
      console.log('');

      if (sources.length > 0) {
        console.log(`Sources (${sources.length}):`);
        for (const s of sources) {
          console.log(`  [${s.source_type}] ${s.source_id.substring(0, 8)} - ${s.relation_type}`);
          if (s.explanation) {
            console.log(`    ${s.explanation}`);
          }
        }
      }

      console.log('');
      console.log('Actions:');
      console.log(`  squire question ${question.id.substring(0, 8)} --ask              # Mark as asked`);
      console.log(`  squire question ${question.id.substring(0, 8)} --answer "text"    # Record answer`);
      console.log(`  squire question ${question.id.substring(0, 8)} --dismiss          # Dismiss`);
      console.log('');
    } catch (error) {
      console.error('Failed to get question:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * graph - Show graph statistics
 */
program
  .command('graph')
  .description('Show knowledge graph statistics')
  .action(async () => {
    try {
      const stats = await getGraphStats();

      console.log('\nKnowledge Graph\n');
      console.log('Nodes:');
      console.log(`  Memories: ${stats.nodeCount.memories}`);
      console.log(`  Entities: ${stats.nodeCount.entities}`);
      console.log('');
      console.log('Edges:');
      console.log(`  Memory connections: ${stats.edgeCount.memoryEdges}`);
      console.log(`  Entity mentions: ${stats.edgeCount.mentions}`);
      console.log('');
      console.log('Connectivity:');
      console.log(`  Avg memory degree: ${stats.averageDegree.memories}`);
      console.log(`  Avg entity degree: ${stats.averageDegree.entities}`);
      console.log(`  Components: ~${stats.components}`);
      console.log('');
    } catch (error) {
      console.error('Failed to get graph stats:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * neighbors - Find entities that co-occur with a given entity
 */
program
  .command('neighbors')
  .description('Find entities that appear in the same memories as a given entity')
  .argument('<entity>', 'Entity name or ID')
  .option('-l, --limit <limit>', 'Maximum number to show', '10')
  .option('-m, --min <count>', 'Minimum shared memories', '1')
  .option('-t, --type <type>', 'Filter by entity type')
  .action(async (entityArg: string, options: { limit: string; min: string; type?: string }) => {
    try {
      // Find entity by name or ID
      let entity = null;
      if (entityArg.length === 36) {
        entity = await getEntity(entityArg);
      } else {
        const matches = await searchEntities(entityArg);
        if (matches.length > 0) {
          entity = matches[0];
        }
      }

      if (!entity) {
        console.log(`\nEntity not found: "${entityArg}"`);
        console.log('Use `squire entities` to see available entities.');
        return;
      }

      const limit = parseInt(options.limit, 10);
      const minShared = parseInt(options.min, 10);

      const neighbors = await findEntityNeighbors(entity.id, {
        limit,
        minSharedMemories: minShared,
        entityType: options.type,
      });

      console.log(`\nNeighbors of ${entity.name} (${entity.entity_type})\n`);

      if (neighbors.length === 0) {
        console.log('No connected entities found.');
        console.log('Entities are connected when they appear in the same memories.');
      } else {
        console.log(`Found ${neighbors.length} connected entities:\n`);

        for (const n of neighbors) {
          const strength = (n.connectionStrength * 100).toFixed(0);
          console.log(`  [${n.entity.entity_type}] ${n.entity.name}`);
          console.log(`    shared memories: ${n.sharedMemoryCount} | strength: ${strength}%`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to find neighbors:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * path - Find path between two entities
 */
program
  .command('path')
  .description('Find connection path between two entities')
  .argument('<entity1>', 'First entity name or ID')
  .argument('<entity2>', 'Second entity name or ID')
  .option('-m, --max-hops <hops>', 'Maximum hops to search', '4')
  .action(async (entity1Arg: string, entity2Arg: string, options: { maxHops: string }) => {
    try {
      // Find first entity
      let entity1 = null;
      if (entity1Arg.length === 36) {
        entity1 = await getEntity(entity1Arg);
      } else {
        const matches = await searchEntities(entity1Arg);
        if (matches.length > 0) {
          entity1 = matches[0];
        }
      }

      // Find second entity
      let entity2 = null;
      if (entity2Arg.length === 36) {
        entity2 = await getEntity(entity2Arg);
      } else {
        const matches = await searchEntities(entity2Arg);
        if (matches.length > 0) {
          entity2 = matches[0];
        }
      }

      if (!entity1) {
        console.log(`\nEntity not found: "${entity1Arg}"`);
        return;
      }
      if (!entity2) {
        console.log(`\nEntity not found: "${entity2Arg}"`);
        return;
      }

      // Check for direct connection first
      const shared = await findSharedMemories(entity1.id, entity2.id, { limit: 5 });
      if (shared.length > 0) {
        console.log(`\n${entity1.name} ←→ ${entity2.name}`);
        console.log(`\nDirectly connected via ${shared.length} shared memories:\n`);
        for (const m of shared) {
          const preview = m.content.length > 60
            ? m.content.substring(0, 60) + '...'
            : m.content;
          console.log(`  [${m.id.substring(0, 8)}] ${preview}`);
        }
        console.log('');
        return;
      }

      // Find indirect path
      const maxHops = parseInt(options.maxHops, 10);
      const result = await findPathBetweenEntities(entity1.id, entity2.id, { maxHops });

      console.log(`\n${entity1.name} → ${entity2.name}\n`);

      if (!result || !result.found) {
        console.log(`No path found within ${maxHops} hops.`);
        console.log('Try increasing --max-hops or these entities may not be connected.');
      } else {
        console.log(`Path found (${result.path.length - 1} hops):\n`);
        for (let i = 0; i < result.path.length; i++) {
          const e = result.path[i];
          if (!e) continue;
          const arrow = i < result.path.length - 1 ? ' →' : '';
          console.log(`  ${i + 1}. [${e.entity_type}] ${e.name}${arrow}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to find path:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * explore - Multi-hop traversal from an entity
 */
program
  .command('explore')
  .description('Explore entities connected to a starting entity')
  .argument('<entity>', 'Entity name or ID')
  .option('-h, --hops <hops>', 'Maximum hops to explore', '2')
  .option('-l, --limit <limit>', 'Maximum entities to show', '20')
  .action(async (entityArg: string, options: { hops: string; limit: string }) => {
    try {
      // Find entity by name or ID
      let entity = null;
      if (entityArg.length === 36) {
        entity = await getEntity(entityArg);
      } else {
        const matches = await searchEntities(entityArg);
        if (matches.length > 0) {
          entity = matches[0];
        }
      }

      if (!entity) {
        console.log(`\nEntity not found: "${entityArg}"`);
        console.log('Use `squire entities` to see available entities.');
        return;
      }

      const maxHops = parseInt(options.hops, 10);
      const limit = parseInt(options.limit, 10);

      const results = await traverseEntities(entity.id, {
        maxHops,
        limit,
      });

      console.log(`\nExploring from ${entity.name} (up to ${maxHops} hops)\n`);

      if (results.length === 0) {
        console.log('No connected entities found.');
      } else {
        // Group by hops
        const byHops = new Map<number, typeof results>();
        for (const r of results) {
          if (!byHops.has(r.hops)) {
            byHops.set(r.hops, []);
          }
          byHops.get(r.hops)!.push(r);
        }

        for (const [hops, entities] of [...byHops.entries()].sort((a, b) => a[0] - b[0])) {
          console.log(`${hops} hop${hops > 1 ? 's' : ''} away (${entities.length}):`);
          for (const e of entities.slice(0, 10)) {
            const strength = (e.pathStrength * 100).toFixed(0);
            console.log(`  [${e.entity.entity_type}] ${e.entity.name} (${strength}%)`);
          }
          if (entities.length > 10) {
            console.log(`  ... and ${entities.length - 10} more`);
          }
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to explore:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * network - Get subgraph around an entity
 */
program
  .command('network')
  .description('Show the local network around an entity')
  .argument('<entity>', 'Entity name or ID')
  .option('-m, --memories <count>', 'Maximum memories to include', '10')
  .option('-e, --entities <count>', 'Maximum connected entities', '5')
  .action(async (entityArg: string, options: { memories: string; entities: string }) => {
    try {
      // Find entity by name or ID
      let entity = null;
      if (entityArg.length === 36) {
        entity = await getEntity(entityArg);
      } else {
        const matches = await searchEntities(entityArg);
        if (matches.length > 0) {
          entity = matches[0];
        }
      }

      if (!entity) {
        console.log(`\nEntity not found: "${entityArg}"`);
        console.log('Use `squire entities` to see available entities.');
        return;
      }

      const memoryLimit = parseInt(options.memories, 10);
      const entityLimit = parseInt(options.entities, 10);

      const subgraph = await getEntitySubgraph(entity.id, {
        memoryLimit,
        entityLimit,
        includeEdges: true,
      });

      console.log(`\nNetwork around ${entity.name}\n`);
      console.log(`  Nodes: ${subgraph.nodes.length} (${subgraph.nodes.filter(n => n.type === 'memory').length} memories, ${subgraph.nodes.filter(n => n.type === 'entity').length} entities)`);
      console.log(`  Edges: ${subgraph.edges.length}`);
      console.log('');

      // Show entities
      const entityNodes = subgraph.nodes.filter(n => n.type === 'entity' && n.id !== entity!.id);
      if (entityNodes.length > 0) {
        console.log('Connected entities:');
        for (const n of entityNodes) {
          const attrs = n.attributes as { entity_type?: string; shared_memories?: number };
          const shared = attrs.shared_memories ? ` (${attrs.shared_memories} shared)` : '';
          console.log(`  [${attrs.entity_type || '?'}] ${n.label}${shared}`);
        }
        console.log('');
      }

      // Show memories
      const memoryNodes = subgraph.nodes.filter(n => n.type === 'memory').slice(0, 5);
      if (memoryNodes.length > 0) {
        console.log('Related memories:');
        for (const n of memoryNodes) {
          console.log(`  [${n.id.substring(0, 8)}] ${n.label}`);
        }
        const totalMemories = subgraph.nodes.filter(n => n.type === 'memory').length;
        if (totalMemories > 5) {
          console.log(`  ... and ${totalMemories - 5} more`);
        }
        console.log('');
      }

      // Show edge types
      const edgeTypes = new Map<string, number>();
      for (const e of subgraph.edges) {
        edgeTypes.set(e.type, (edgeTypes.get(e.type) || 0) + 1);
      }
      if (edgeTypes.size > 0) {
        console.log('Edge types:');
        for (const [type, count] of edgeTypes) {
          console.log(`  ${type}: ${count}`);
        }
        console.log('');
      }
    } catch (error) {
      console.error('Failed to get network:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

// ============================================================================
// OBJECT STORAGE COMMANDS
// ============================================================================

/**
 * Helper to format file size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * objects - List stored objects
 */
program
  .command('objects')
  .description('List stored objects (files, images, documents)')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('-t, --type <type>', 'Filter by type (image, document, audio, video, archive, other)')
  .option('--tag <tag>', 'Filter by tag')
  .option('-s, --search <query>', 'Search by name or description')
  .action(async (options: { limit: string; type?: string; tag?: string; search?: string }) => {
    try {
      const limit = parseInt(options.limit, 10);

      if (options.type && !OBJECT_TYPES.includes(options.type as ObjectType)) {
        console.log(`\nInvalid type: ${options.type}`);
        console.log(`Valid types: ${OBJECT_TYPES.join(', ')}`);
        return;
      }

      const objects = await listObjects({
        limit,
        objectType: options.type as ObjectType | undefined,
        tag: options.tag,
        search: options.search,
      });

      const stats = await getObjectStats();

      console.log(`\nObjects (${objects.length} of ${stats.total})\n`);

      if (objects.length === 0) {
        console.log('No objects found.');
        console.log('Use `squire upload <file>` to store a file.');
      } else {
        for (const obj of objects) {
          const date = new Date(obj.created_at).toLocaleDateString();
          const size = formatBytes(obj.size_bytes);
          const icon = obj.object_type === 'image' ? '🖼️' :
                       obj.object_type === 'document' ? '📄' :
                       obj.object_type === 'audio' ? '🎵' :
                       obj.object_type === 'video' ? '🎬' :
                       obj.object_type === 'archive' ? '📦' : '📎';

          console.log(`${icon} [${obj.id.substring(0, 8)}] ${obj.name}`);
          console.log(`   ${obj.object_type} | ${size} | ${date}`);
          if (obj.description) {
            const desc = obj.description.length > 50
              ? obj.description.substring(0, 50) + '...'
              : obj.description;
            console.log(`   "${desc}"`);
          }
          console.log('');
        }
      }

      // Show summary
      console.log('Summary:');
      console.log(`  Images: ${stats.by_type.image} | Documents: ${stats.by_type.document} | Audio: ${stats.by_type.audio}`);
      console.log(`  Video: ${stats.by_type.video} | Archives: ${stats.by_type.archive} | Other: ${stats.by_type.other}`);
      console.log(`  Total size: ${formatBytes(stats.total_size_bytes)}`);
      console.log('');
    } catch (error) {
      console.error('Failed to list objects:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * object - Show object details
 */
program
  .command('object')
  .description('Show object details')
  .argument('<id>', 'Object ID (partial or full)')
  .option('--link-memory <memoryId>', 'Link to a memory')
  .option('--unlink-memory <memoryId>', 'Unlink from a memory')
  .option('--link-entity <entityId>', 'Link to an entity')
  .option('--add-tag <tag>', 'Add a tag')
  .option('--remove-tag <tag>', 'Remove a tag')
  .option('--delete', 'Delete this object')
  .action(async (idArg: string, options: {
    linkMemory?: string;
    unlinkMemory?: string;
    linkEntity?: string;
    addTag?: string;
    removeTag?: string;
    delete?: boolean;
  }) => {
    try {
      // Find object - support partial IDs
      let object = null;

      // Only try UUID lookup if it looks like a full UUID
      if (idArg.length === 36 && idArg.includes('-')) {
        object = await getObjectById(idArg);
      }

      if (!object) {
        // Try partial ID match
        const allObjects = await listObjects({ limit: 100 });
        const match = allObjects.find(o => o.id.startsWith(idArg));
        if (match) {
          object = match;
        }
      }

      if (!object) {
        console.log(`\nObject not found: ${idArg}`);
        return;
      }

      // Handle operations
      if (options.delete) {
        await deleteObject(object.id);
        console.log(`\nObject deleted: ${object.name}`);
        return;
      }

      if (options.linkMemory) {
        await linkToMemory(object.id, options.linkMemory);
        console.log(`Linked to memory: ${options.linkMemory.substring(0, 8)}`);
      }

      if (options.unlinkMemory) {
        await unlinkFromMemory(object.id, options.unlinkMemory);
        console.log(`Unlinked from memory: ${options.unlinkMemory.substring(0, 8)}`);
      }

      if (options.linkEntity) {
        await linkToEntity(object.id, options.linkEntity);
        console.log(`Linked to entity: ${options.linkEntity.substring(0, 8)}`);
      }

      if (options.addTag) {
        await addTag(object.id, options.addTag);
        console.log(`Added tag: ${options.addTag}`);
      }

      if (options.removeTag) {
        await removeTag(object.id, options.removeTag);
        console.log(`Removed tag: ${options.removeTag}`);
      }

      // Re-fetch object if modified
      if (options.linkMemory || options.unlinkMemory || options.linkEntity || options.addTag || options.removeTag) {
        object = await getObjectById(object.id);
        if (!object) return;
      }

      // Display object details
      const icon = object.object_type === 'image' ? '🖼️' :
                   object.object_type === 'document' ? '📄' :
                   object.object_type === 'audio' ? '🎵' :
                   object.object_type === 'video' ? '🎬' :
                   object.object_type === 'archive' ? '📦' : '📎';

      console.log(`\n${icon} ${object.name}\n`);
      console.log(`ID: ${object.id}`);
      console.log(`Type: ${object.object_type}`);
      console.log(`Filename: ${object.filename}`);
      console.log(`Size: ${formatBytes(object.size_bytes)}`);
      console.log(`MIME: ${object.mime_type}`);
      console.log(`Status: ${object.status}`);
      console.log(`Processing: ${object.processing_status}`);
      console.log(`Created: ${new Date(object.created_at).toLocaleString()}`);
      console.log(`Source: ${object.source}`);

      if (object.description) {
        console.log(`\nDescription: ${object.description}`);
      }

      if (object.extracted_text) {
        const preview = object.extracted_text.length > 100
          ? object.extracted_text.substring(0, 100) + '...'
          : object.extracted_text;
        console.log(`\nExtracted text: ${preview}`);
      }

      // Show tags
      const tags = await getObjectTags(object.id);
      if (tags.length > 0) {
        console.log(`\nTags: ${tags.map(t => t.tag).join(', ')}`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to get object:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * upload - Upload a file
 */
program
  .command('upload')
  .description('Upload a file as an object')
  .argument('<file>', 'Path to file')
  .option('-n, --name <name>', 'Display name (defaults to filename)')
  .option('-d, --description <desc>', 'Description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-m, --memory <memoryId>', 'Link to a memory')
  .option('-e, --entity <entityId>', 'Link to an entity')
  .action(async (filePath: string, options: {
    name?: string;
    description?: string;
    tags?: string;
    memory?: string;
    entity?: string;
  }) => {
    try {
      // Read file
      const data = readFileSync(filePath);
      const filename = filePath.split('/').pop() || filePath;

      // Detect MIME type from extension
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
        'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain', 'md': 'text/markdown',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
        'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
        'zip': 'application/zip', 'tar': 'application/x-tar', 'gz': 'application/gzip',
        'json': 'application/json', 'xml': 'application/xml',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      const tags = options.tags?.split(',').map(t => t.trim()).filter(Boolean);

      const result = await createObject({
        name: options.name || filename,
        filename,
        mimeType,
        data,
        description: options.description,
        tags,
      });

      if (result.isDuplicate) {
        console.log(`\nFile already exists (duplicate detected)`);
        console.log(`Existing ID: ${result.object.id}`);
      } else {
        console.log(`\nFile uploaded successfully!`);
        console.log(`ID: ${result.object.id}`);
        console.log(`Type: ${result.object.object_type}`);
        console.log(`Size: ${formatBytes(result.object.size_bytes)}`);

        // Link to memory if specified
        if (options.memory) {
          await linkToMemory(result.object.id, options.memory);
          console.log(`Linked to memory: ${options.memory.substring(0, 8)}`);
        }

        // Link to entity if specified
        if (options.entity) {
          await linkToEntity(result.object.id, options.entity);
          console.log(`Linked to entity: ${options.entity.substring(0, 8)}`);
        }

        if (result.tags.length > 0) {
          console.log(`Tags: ${result.tags.map(t => t.tag).join(', ')}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to upload file:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * tags - List all object tags
 */
program
  .command('tags')
  .description('List all object tags with counts')
  .action(async () => {
    try {
      const tags = await getAllTags();

      console.log(`\nObject Tags (${tags.length})\n`);

      if (tags.length === 0) {
        console.log('No tags found.');
        console.log('Use `squire upload <file> -t tag1,tag2` or `squire object <id> --add-tag <tag>`');
      } else {
        for (const t of tags) {
          console.log(`  ${t.tag} (${t.count})`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to list tags:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * collections - List object collections
 */
program
  .command('collections')
  .description('List object collections')
  .action(async () => {
    try {
      const collections = await listCollections();

      console.log(`\nCollections (${collections.length})\n`);

      if (collections.length === 0) {
        console.log('No collections found.');
        console.log('Use `squire collection-create <name>` to create one.');
      } else {
        for (const c of collections) {
          const date = new Date(c.updated_at).toLocaleDateString();
          console.log(`📁 [${c.id.substring(0, 8)}] ${c.name}`);
          console.log(`   ${c.object_count} objects | updated: ${date}`);
          if (c.description) {
            console.log(`   ${c.description}`);
          }
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to list collections:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * collection - Show collection details
 */
program
  .command('collection')
  .description('Show collection details and contents')
  .argument('<id>', 'Collection ID (partial or full)')
  .option('--add <objectId>', 'Add object to collection')
  .option('--remove <objectId>', 'Remove object from collection')
  .action(async (idArg: string, options: { add?: string; remove?: string }) => {
    try {
      // Find collection - support partial IDs
      let collection = null;

      // Only try UUID lookup if it looks like a full UUID
      if (idArg.length === 36 && idArg.includes('-')) {
        collection = await getCollectionById(idArg);
      }

      if (!collection) {
        const allCollections = await listCollections();
        const match = allCollections.find(c => c.id.startsWith(idArg));
        if (match) {
          collection = match;
        }
      }

      if (!collection) {
        console.log(`\nCollection not found: ${idArg}`);
        return;
      }

      // Handle operations
      if (options.add) {
        await addToCollection(collection.id, options.add);
        console.log(`Added object: ${options.add.substring(0, 8)}`);
        // Re-fetch
        collection = await getCollectionById(collection.id);
        if (!collection) return;
      }

      if (options.remove) {
        await removeFromCollection(collection.id, options.remove);
        console.log(`Removed object: ${options.remove.substring(0, 8)}`);
        // Re-fetch
        collection = await getCollectionById(collection.id);
        if (!collection) return;
      }

      console.log(`\n📁 ${collection.name}\n`);
      console.log(`ID: ${collection.id}`);
      console.log(`Objects: ${collection.object_count}`);
      console.log(`Updated: ${new Date(collection.updated_at).toLocaleString()}`);
      if (collection.description) {
        console.log(`Description: ${collection.description}`);
      }

      const objects = await getCollectionObjects(collection.id);
      if (objects.length > 0) {
        console.log(`\nContents:\n`);
        for (const obj of objects) {
          const icon = obj.object_type === 'image' ? '🖼️' :
                       obj.object_type === 'document' ? '📄' :
                       obj.object_type === 'audio' ? '🎵' :
                       obj.object_type === 'video' ? '🎬' :
                       obj.object_type === 'archive' ? '📦' : '📎';
          console.log(`  ${icon} [${obj.id.substring(0, 8)}] ${obj.name}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('Failed to get collection:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * collection-create - Create a new collection
 */
program
  .command('collection-create')
  .description('Create a new object collection')
  .argument('<name>', 'Collection name')
  .option('-d, --description <desc>', 'Description')
  .action(async (name: string, options: { description?: string }) => {
    try {
      const collection = await createCollection(name, options.description);
      console.log(`\nCollection created!`);
      console.log(`ID: ${collection.id}`);
      console.log(`Name: ${collection.name}`);
      console.log('');
    } catch (error) {
      console.error('Failed to create collection:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

program.parse();
