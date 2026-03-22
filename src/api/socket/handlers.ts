/**
 * Socket.IO Event Handlers (P6-T2)
 *
 * Handles WebSocket events for real-time chat and notifications.
 */

import { Server, Socket } from 'socket.io';
import { config } from '../../config/index.js';
import { generateContext } from '../../services/context.js';
import { detectStoryIntent, isStoryIntent, describeIntent } from '../../services/storyIntent.js';
import { generateStory, type StoryResult } from '../../services/storyEngine.js';
import { getOrCreateConversation, addMessage } from '../../services/conversations.js';
import { consolidateAll } from '../../services/consolidation.js';
import { processMessageRealTime } from '../../services/chatExtraction.js';
import { getUserIdentity } from '../../services/identity.js';
import {
  markConfirmationOffered,
  confirmCandidate,
  dismissCandidate,
  getLastOfferedCandidate,
} from '../../services/commitments.js';
import {
  getToolDefinitions,
  hasTools,
  executeTools,
  type ToolCall,
  type ToolDefinition,
} from '../../tools/index.js';
import { streamLLM } from '../../services/llm/index.js';
import { buildMemoryContext } from '../../services/memory/index.js';
import { SQUIRE_SYSTEM_PROMPT_BASE, TOOL_CALLING_INSTRUCTIONS } from '../../constants/prompts.js';
import { getObjectById } from '../../services/objects.js';
import { getSummary } from '../../services/summaries.js';
import { searchForContext } from '../../services/documents/search.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  ChatMessagePayload,
  ChatCancelPayload,
  ConversationJoinPayload,
  ConversationLeavePayload,
  ImageContent,
} from './types.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type TypedIO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

// Track active streaming requests for cancellation
const activeStreams = new Map<string, AbortController>();

// Debounced consolidation timer
// Consolidation runs after 15 minutes of inactivity (no new messages)
// This ensures memories are extracted and processed without blocking user interactions
const CONSOLIDATION_DELAY_MS = 15 * 60 * 1000; // 15 minutes
let consolidationTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule consolidation to run after inactivity period
 * Resets the timer on each call (debounce pattern)
 */
function scheduleConsolidation(): void {
  // Clear existing timer if any
  if (consolidationTimer) {
    clearTimeout(consolidationTimer);
  }

  consolidationTimer = setTimeout(async () => {
    console.log('[AutoSleep] 15 min inactivity - running background consolidation');
    try {
      const result = await consolidateAll();
      console.log(
        `[AutoSleep] Consolidation complete: ${result.chatMemoriesCreated} memories extracted, ` +
        `${result.memoriesProcessed} memories processed, ${result.durationMs}ms`
      );
    } catch (error) {
      console.error('[AutoSleep] Consolidation error:', error);
    }
    consolidationTimer = null;
  }, CONSOLIDATION_DELAY_MS);

  console.log('[AutoSleep] Consolidation scheduled for 15 min from now');
}

// === PHASE 4: COMMITMENT CANDIDATE RESPONSE DETECTION ===

// Patterns for detecting confirmation/dismissal responses
const CONFIRM_PATTERNS = /^(yes|yeah|yep|yup|sure|ok|okay|please|do that|track it|add it|confirm|absolutely|definitely|of course|go ahead)\b/i;
const DISMISS_PATTERNS = /^(no|nah|nope|don't|skip|nevermind|never mind|cancel|dismiss|not now|forget it|no thanks)\b/i;

/**
 * Check if user is responding to a commitment confirmation prompt.
 * If so, handle it and send a response directly.
 * Returns true if handled (caller should skip normal LLM flow).
 */
async function checkCandidateResponse(
  message: string,
  socket: TypedSocket,
  io: TypedIO,
  conversationId: string
): Promise<boolean> {
  // Check if there's a recently offered candidate
  const candidate = await getLastOfferedCandidate();
  if (!candidate) {
    return false;
  }

  // Check if the message is a confirmation or dismissal
  const isConfirm = CONFIRM_PATTERNS.test(message.trim());
  const isDismiss = DISMISS_PATTERNS.test(message.trim());

  if (!isConfirm && !isDismiss) {
    return false;
  }

  let responseText: string;

  if (isConfirm) {
    const confirmed = await confirmCandidate(candidate.id);
    if (confirmed) {
      responseText = `✓ Got it! I'm now tracking "${candidate.title}" as a task.`;
      socket.emit('commitment:created', {
        id: candidate.id,
        title: candidate.title,
      });
    } else {
      responseText = `I couldn't find that task to confirm. It may have already been processed.`;
    }
  } else {
    const dismissed = await dismissCandidate(candidate.id);
    if (dismissed) {
      responseText = `No problem, I won't track "${candidate.title}".`;
      socket.emit('commitment:dismissed', {
        id: candidate.id,
        title: candidate.title,
      });
    } else {
      responseText = `I couldn't find that task to dismiss. It may have already been processed.`;
    }
  }

  // Send the response as a streaming chunk + done
  socket.emit('chat:chunk', {
    conversationId,
    chunk: responseText,
    done: false,
  });
  io.to(`conversation:${conversationId}`).emit('chat:done', { conversationId });

  // Persist the assistant message
  const { addMessage: addChatMessage } = await import('../../services/conversations.js');
  await addChatMessage({
    conversationId,
    role: 'assistant',
    content: responseText,
  });

  // Broadcast to other devices
  io.to(`conversation:${conversationId}`).emit('message:synced', {
    conversationId,
    message: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[Socket] Candidate ${isConfirm ? 'CONFIRMED' : 'DISMISSED'}: "${candidate.title}"`);
  return true;
}

// === FOLLOW-UP ACKNOWLEDGMENT TEMPLATES ===

function formatReminderAcknowledgment(title: string, remindAt: string): string {
  const date = new Date(remindAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  // Use system-detected timezone for user-facing display
  const userTimezone = config.timezone;

  let timeStr: string;
  if (diffMins < 60) {
    timeStr = `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  } else if (diffMins < 1440) {
    const hours = Math.round(diffMins / 60);
    timeStr = `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: userTimezone
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: userTimezone
    };
    timeStr = `on ${date.toLocaleDateString('en-US', dateOptions)} at ${date.toLocaleTimeString('en-US', timeOptions)}`;
  }

  return `\n\n---\n✓ I've set a reminder for you: "${title}" ${timeStr}.`;
}

// Phase 4: Changed from acknowledgment to confirmation prompt
// Commitments now start as 'candidate' and need user confirmation
function formatCommitmentConfirmationPrompt(title: string): string {
  return `\n\n---\n📋 Would you like me to track "${title}" as a task?`;
}

/**
 * Build the complete system prompt with user identity
 */
async function buildSystemPrompt(): Promise<string> {
  let prompt = SQUIRE_SYSTEM_PROMPT_BASE;

  // Add user identity if known
  const identity = await getUserIdentity();
  if (identity?.name) {
    prompt = `You are talking to ${identity.name}.\n\n` + prompt;
  }

  // Add tool calling instructions
  if (hasTools()) {
    prompt += TOOL_CALLING_INSTRUCTIONS;
  }

  return prompt;
}

/**
 * Get current timestamp for system prompt grounding
 * Uses Eastern Time (user's timezone)
 */
function getCurrentTimeContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: config.timezone,
    timeZoneName: 'short',
  };
  const formatted = now.toLocaleString('en-US', options);
  return `\n\nCurrent date and time: ${formatted}`;
}

// === DOCUMENT DISCUSSION MODE ===

const DOC_TEXT_THRESHOLD = 40_000; // ~10k tokens — above this, use chunk search

/**
 * Handle document discussion messages.
 * Uses lean user context (personality + relationships only) and injects
 * the document content directly into the system prompt.
 */
async function handleDocumentDiscussion(
  socket: TypedSocket,
  io: TypedIO,
  payload: ChatMessagePayload
): Promise<void> {
  const { conversationId, message, history = [], documentId } = payload;

  console.log(`[Socket] Document discussion mode - doc: ${documentId}, conversation: ${conversationId}`);

  let chatDoneEmitted = false;
  const abortController = new AbortController();
  activeStreams.set(conversationId, abortController);

  try {
    // Step 0: Ensure conversation + persist user message
    const conversation = await getOrCreateConversation(conversationId);
    const userMessage = await addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: message,
    });
    broadcastMessageSynced(io, conversationId, {
      id: userMessage.id,
      role: 'user',
      content: message,
      timestamp: userMessage.created_at.toISOString(),
    }, socket.id);

    // Step 1: Fetch document and lean user context in parallel
    const [document, personalitySummary, relationshipsSummary, systemPromptBase] = await Promise.all([
      getObjectById(documentId!),
      getSummary('personality'),
      getSummary('relationships'),
      buildSystemPrompt(),
    ]);

    if (!document || !document.extracted_text) {
      socket.emit('chat:error', {
        conversationId,
        error: 'Document not found or has no extracted text.',
        code: 'DOC_NOT_FOUND',
      });
      return;
    }

    // Step 2: Build document content (full text for short docs, chunks for long)
    let documentContent: string;
    if (document.extracted_text.length <= DOC_TEXT_THRESHOLD) {
      documentContent = document.extracted_text;
    } else {
      // Long document — search for relevant chunks
      console.log(`[Socket] Long document (${document.extracted_text.length} chars) — using chunk search`);
      const chunkResult = await searchForContext(message, {
        documentId: documentId!,
        maxTokens: 8000,
        limit: 10,
        threshold: 0.2,
      });
      if (chunkResult.chunks.length > 0) {
        documentContent = chunkResult.chunks
          .map((c, i) => {
            const loc = c.pageNumber ? `p.${c.pageNumber}` : `chunk ${i + 1}`;
            const section = c.sectionTitle ? ` — ${c.sectionTitle}` : '';
            return `[Section ${i + 1}: ${loc}${section}]\n${c.content}`;
          })
          .join('\n\n');
        documentContent = `This document is large. Showing the ${chunkResult.chunks.length} most relevant sections to your question.\n\n${documentContent}`;
      } else {
        // Fallback: first portion of extracted text
        documentContent = document.extracted_text.substring(0, DOC_TEXT_THRESHOLD);
        documentContent += '\n\n[Document truncated — ask about specific sections for more detail]';
      }
    }

    // Step 3: Build lean system prompt
    const sizeKb = document.size_bytes ? `${(document.size_bytes / 1024).toFixed(0)} KB` : 'unknown size';

    // Dynamic system content (date/time + user context + document)
    let dynamicContent = getCurrentTimeContext();

    // Minimal user context — personality + relationships only (~4K)
    const userContextParts: string[] = [];
    if (personalitySummary?.content) {
      userContextParts.push(`**Personality**: ${personalitySummary.content}`);
    }
    if (relationshipsSummary?.content) {
      userContextParts.push(`**Relationships**: ${relationshipsSummary.content}`);
    }
    if (userContextParts.length > 0) {
      dynamicContent += `\n\n## About the Person You're Talking To\n\n${userContextParts.join('\n\n')}`;
    }

    // Document content injection
    dynamicContent += `\n\n## Document Under Discussion

The user has selected this document for focused discussion. Answer based on its contents.

**Document**: ${document.name} (${document.mime_type}, ${sizeKb})

--- DOCUMENT CONTENT ---

${documentContent}

--- END DOCUMENT ---

- Answer based on what is in the document
- Cite specific sections or passages when relevant
- If information is not in the document, say so clearly`;

    // Step 4: Build messages array
    const messages: Array<{ role: string; content: string; images?: ImageContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }> = [];
    messages.push({ role: 'system', content: systemPromptBase });
    messages.push({ role: 'system', content: dynamicContent });

    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: message });

    // Step 5: Stream LLM response
    const tools = hasTools() ? getToolDefinitions() : undefined;
    console.log(`[Socket] Document discussion: streaming response (${tools?.length ?? 0} tools available)`);
    const streamResult = await streamWithToolLoop(socket, conversationId, messages, abortController.signal, tools);

    // Step 6: Emit done + persist
    io.to(`conversation:${conversationId}`).emit('chat:done', {
      conversationId,
      usage: streamResult.usage ? {
        promptTokens: streamResult.usage.promptTokens,
        completionTokens: streamResult.usage.completionTokens,
        totalTokens: streamResult.usage.promptTokens + streamResult.usage.completionTokens,
      } : undefined,
    });
    chatDoneEmitted = true;

    if (streamResult.content) {
      const assistantMessage = await addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: streamResult.content,
        promptTokens: streamResult.usage?.promptTokens,
        completionTokens: streamResult.usage?.completionTokens,
      });
      broadcastMessageSynced(io, conversationId, {
        id: assistantMessage.id,
        role: 'assistant',
        content: streamResult.content,
        timestamp: assistantMessage.created_at.toISOString(),
      }, socket.id);
    }
  } catch (error) {
    console.error('[Socket] Document discussion error:', error);
    socket.emit('chat:error', {
      conversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'DOC_CHAT_ERROR',
    });
  } finally {
    if (!chatDoneEmitted) {
      io.to(`conversation:${conversationId}`).emit('chat:done', { conversationId });
    }
    activeStreams.delete(conversationId);
  }
}

/**
 * Handle chat:message event - stream LLM response
 */
async function handleChatMessage(
  socket: TypedSocket,
  io: TypedIO,
  payload: ChatMessagePayload
): Promise<void> {
  const { conversationId, message, images, history = [], includeContext = true, contextProfile, documentId } = payload;

  console.log(`[Socket] chat:message from ${socket.id} - conversation: ${conversationId}`);

  // Document discussion mode — separate handler, lean context
  if (documentId) {
    return handleDocumentDiscussion(socket, io, payload);
  }

  // Track if we've emitted chat:done to avoid duplicates
  let chatDoneEmitted = false;

  // Schedule consolidation for later (debounced - resets on each message)
  // Consolidation will run 15 min after the last message
  scheduleConsolidation();

  // Create abort controller for this stream
  const abortController = new AbortController();
  activeStreams.set(conversationId, abortController);

  // Track context for persistence
  let memoryIds: string[] = [];
  let disclosureId: string | undefined;

  try {
    console.log(`[Socket] Step 0: Getting/creating conversation...`);
    // Step 0: Ensure conversation exists in database
    const conversation = await getOrCreateConversation(conversationId);
    console.log(`[Socket] Conversation ready: ${conversation.id}`);

    // Step 1: Persist user message immediately
    const userMessage = await addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: message,
    });

    // Broadcast user message to all devices in this conversation room
    broadcastMessageSynced(io, conversationId, {
      id: userMessage.id,
      role: 'user',
      content: message,
      timestamp: userMessage.created_at.toISOString(),
    }, socket.id);

    // Phase 4: Check for commitment confirmation/dismissal response
    // If user just said yes/no to a candidate prompt, handle it immediately
    const candidateResponse = await checkCandidateResponse(message, socket, io, conversationId);
    if (candidateResponse) {
      // User confirmed/dismissed - we've already sent a response, skip LLM
      return;
    }

    // Step 1.5: Start real-time extraction for commitments/reminders
    // Runs in parallel with context fetch and LLM response - awaited after streaming
    const extractionPromise = processMessageRealTime(message).catch((error) => {
      console.error('[Socket] Real-time extraction error:', error);
      return { commitmentCreated: null, reminderCreated: null };
    });

    // Start system prompt + memory context early (overlap with context generation)
    const systemPromptPromise = buildSystemPrompt();
    const memoryContextPromise = buildMemoryContext(message).catch((error) => {
      console.error('[Socket] Memory context retrieval failed:', error);
      return '';
    });

    // Step 2: Check for Story Intent and generate context
    let contextMarkdown: string | undefined;
    let storyResult: StoryResult | undefined;

    if (includeContext) {
      try {
        // Phase 1: Story Engine - detect if this is a biographical/narrative query
        console.log(`[Socket] Step 2a: Detecting story intent...`);
        const intent = await detectStoryIntent(message);

        if (isStoryIntent(intent)) {
          // This is a story query - use Story Engine instead of RAG
          console.log(`[Socket] Story intent detected: ${describeIntent(intent)}`);

          try {
            storyResult = await generateStory({ query: message, intent });
            console.log(`[Socket] Story generated with ${storyResult.evidence.length} evidence nodes`);

            // Use story narrative as context for the LLM
            contextMarkdown = `## Personal Story Context

The user is asking about something personal. Here is the synthesized narrative from their memories:

${storyResult.narrative}

---

### Evidence Used (${storyResult.evidence.length} items):
${storyResult.evidence.slice(0, 10).map((e) => `- ${e.content.substring(0, 150)}...`).join('\n')}

---

Use this narrative to respond naturally. You can expand on it or answer follow-up questions based on this context.`;

            memoryIds = storyResult.evidence
              .filter((e) => e.type === 'memory')
              .map((e) => e.id);

            // Emit story context to client
            socket.emit('chat:context', {
              conversationId,
              memories: storyResult.evidence
                .filter((e) => e.type === 'memory')
                .slice(0, 10)
                .map((e) => ({
                  id: e.id,
                  content: e.content.substring(0, 200),
                  salience: e.salience ?? 5,
                })),
              entities: [],
              summaries: [],
            });
          } catch (storyError) {
            console.error('[Socket] Story generation failed, falling back to RAG:', storyError);
            // Fall through to regular context generation
          }
        }

        // If no story was generated, use regular RAG context
        if (!storyResult) {
          console.log(`[Socket] Step 2b: Generating RAG context...`);
          const contextPackage = await generateContext({
            query: message,
            profile: contextProfile,
          });
          console.log(`[Socket] Context generated: ${contextPackage.memories.length} memories`);

          contextMarkdown = contextPackage.markdown;
          memoryIds = contextPackage.memories.map((m) => m.id);
          disclosureId = contextPackage.disclosure_id;

          // Emit context to client
          socket.emit('chat:context', {
            conversationId,
            memories: contextPackage.memories.map((m) => ({
              id: m.id,
              content: m.content.substring(0, 200),
              salience: m.salience_score,
            })),
            entities: contextPackage.entities.map((e) => ({
              id: e.id,
              name: e.name,
              type: e.type,
            })),
            summaries: contextPackage.summaries.map((s) => s.category),
          });
        }
      } catch (error) {
        console.error('[Socket] Context generation failed:', error);
        // Continue without context
      }
    }

    // Step 3: Build messages — await promises started before context generation
    const messages: Array<{ role: string; content: string; images?: ImageContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }> = [];

    const [systemPromptBase, memoryContext] = await Promise.all([
      systemPromptPromise,
      memoryContextPromise,
    ]);

    // Static system prompt (cacheable — identical across calls)
    messages.push({ role: 'system', content: systemPromptBase });

    // Dynamic system prompt (changes per call — date/time + context)
    let dynamicContent = getCurrentTimeContext();
    if (memoryContext) {
      dynamicContent += `\n\n---\n\n${memoryContext}`;
    }
    if (contextMarkdown) {
      dynamicContent += `\n\n---\n\n${contextMarkdown}`;
    }
    messages.push({ role: 'system', content: dynamicContent });

    // Add conversation history
    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current message with optional images
    messages.push({ role: 'user', content: message, images });

    // Step 4: Stream LLM response with iterative tool loop
    const tools = hasTools() ? getToolDefinitions() : undefined;
    
    // Force Anthropic for vision - xAI/Grok doesn't support images
    const hasImages = images && images.length > 0;
    const providerOverride = hasImages ? { provider: 'anthropic', model: 'claude-sonnet-4-6' } : undefined;
    const providerName = providerOverride?.provider ?? config.llm.provider;
    
    console.log(`[Socket] Step 4: Starting ${providerName} stream... (${tools?.length ?? 0} tools available${hasImages ? ', with images' : ''})`);
    const streamResult = await streamWithToolLoop(socket, conversationId, messages, abortController.signal, tools, providerOverride);
    console.log(`[Socket] Stream complete: ${streamResult.content.length} chars`);

    // Step 5: Await extraction and stream follow-up acknowledgment if needed
    let fullContent = streamResult.content;
    const extracted = await extractionPromise;

    if (extracted.commitmentCreated || extracted.reminderCreated) {
      let followUp = '';

      if (extracted.reminderCreated) {
        followUp = formatReminderAcknowledgment(
          extracted.reminderCreated.title,
          extracted.reminderCreated.remind_at
        );
        socket.emit('reminder:created', {
          id: extracted.reminderCreated.id,
          title: extracted.reminderCreated.title,
          remind_at: extracted.reminderCreated.remind_at,
        });
        console.log(`[Socket] Reminder created: "${extracted.reminderCreated.title}"`);
      } else if (extracted.commitmentCreated) {
        // Phase 4: Commitments are now candidates - prompt for confirmation
        followUp = formatCommitmentConfirmationPrompt(extracted.commitmentCreated.title);
        // Mark as offered so we know which candidate to confirm on user response
        await markConfirmationOffered(extracted.commitmentCreated.id);
        socket.emit('commitment:candidate', {
          id: extracted.commitmentCreated.id,
          title: extracted.commitmentCreated.title,
        });
        console.log(`[Socket] Commitment CANDIDATE offered: "${extracted.commitmentCreated.title}"`);
      }

      // Stream the follow-up as additional chunks
      if (followUp) {
        socket.emit('chat:chunk', {
          conversationId,
          chunk: followUp,
          done: false,
        });
        fullContent += followUp;
      }
    }

    // Emit chat:done after follow-up
    // Belt-and-suspenders: emit directly to socket AND broadcast to room
    // Direct emit guarantees originating socket gets it; room broadcast covers reconnected sockets
    const chatDonePayload = {
      conversationId,
      usage: streamResult.usage ? {
        promptTokens: streamResult.usage.promptTokens,
        completionTokens: streamResult.usage.completionTokens,
        totalTokens: streamResult.usage.promptTokens + streamResult.usage.completionTokens,
      } : undefined,
      reportData: streamResult.reportData,
    };
    console.log(`[Socket] Emitting chat:done for conversation: ${conversationId}${streamResult.reportData ? ' (with report)' : ''}`);
    socket.emit('chat:done', chatDonePayload);
    io.to(`conversation:${conversationId}`).emit('chat:done', chatDonePayload);
    chatDoneEmitted = true;

    // Step 6: Persist assistant message (including follow-up) after streaming completes
    if (fullContent) {
      const assistantMessage = await addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: fullContent,
        memoryIds,
        disclosureId,
        contextProfile,
        promptTokens: streamResult.usage?.promptTokens,
        completionTokens: streamResult.usage?.completionTokens,
        metadata: streamResult.reportData ? { reportData: streamResult.reportData } : null,
      });

      // Broadcast assistant message to all devices in this conversation room
      broadcastMessageSynced(io, conversationId, {
        id: assistantMessage.id,
        role: 'assistant',
        content: fullContent,
        timestamp: assistantMessage.created_at.toISOString(),
      }, socket.id);
    }
  } catch (error) {
    console.error('[Socket] Chat error:', error);

    socket.emit('chat:error', {
      conversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'CHAT_ERROR',
    });
  } finally {
    // ALWAYS emit chat:done if not already emitted - this clears the loading state
    if (!chatDoneEmitted) {
      console.log(`[Socket] Emitting chat:done in finally block (error case)`);
      socket.emit('chat:done', { conversationId });
      io.to(`conversation:${conversationId}`).emit('chat:done', { conversationId });
    }
    activeStreams.delete(conversationId);
  }
}

// === Streaming with Tool Loop ===

const MAX_TOOL_ITERATIONS = 50;

/**
 * Stream LLM response with iterative tool execution loop.
 *
 * Uses the unified streamLLM service — all provider-specific SSE parsing,
 * message formatting, and prompt caching is handled there.
 *
 * The tool loop is iterative (not recursive), with a hard cap at
 * MAX_TOOL_ITERATIONS to prevent infinite loops.
 */
async function streamWithToolLoop(
  socket: TypedSocket,
  conversationId: string,
  messages: Array<{ role: string; content: string; images?: ImageContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  signal: AbortSignal,
  tools?: ToolDefinition[],
  providerOverride?: { provider: string; model: string }
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number }; reportData?: { title: string; summary: string; content: string; generatedAt: string } }> {
  let fullContent = '';
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let reportData: { title: string; summary: string; content: string; generatedAt: string } | undefined;
  const currentMessages = [...messages];

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    // Stream one LLM response
    const response = await streamLLM(
      currentMessages as Parameters<typeof streamLLM>[0],
      tools,
      {
        onChunk: (chunk) => {
          socket.emit('chat:chunk', {
            conversationId,
            chunk,
            done: false,
          });
        },
      },
      { signal, ...providerOverride }
    );

    fullContent += response.content;
    totalPromptTokens += response.usage?.promptTokens ?? 0;
    totalCompletionTokens += response.usage?.completionTokens ?? 0;

    // No tool calls → we're done
    if (response.toolCalls.length === 0) {
      break;
    }

    // Check iteration limit
    if (iteration >= MAX_TOOL_ITERATIONS) {
      console.warn(`[Socket] Tool loop hit max iterations (${MAX_TOOL_ITERATIONS}) for conversation ${conversationId}`);
      socket.emit('chat:chunk', {
        conversationId,
        chunk: '\n\n[Tool execution limit reached.]',
        done: false,
      });
      break;
    }

    // Execute tool calls
    console.log(`[Socket] Tool iteration ${iteration + 1}: ${response.toolCalls.map((t) => t.function.name).join(', ')}`);
    const toolResults = await executeTools(response.toolCalls);

    for (const result of toolResults) {
      console.log(`[Socket] Tool ${result.name}: ${result.success ? 'success' : 'failed'}`);

      // Check for present_report tool result
      if (result.name === 'present_report' && result.success) {
        try {
          const parsed = JSON.parse(result.result);
          if (parsed.type === 'report') {
            reportData = {
              title: parsed.title,
              summary: parsed.summary,
              content: parsed.content,
              generatedAt: parsed.generatedAt,
            };
            console.log(`[Socket] Report data captured: "${reportData.title}"`);
          }
        } catch {
          console.warn('[Socket] Failed to parse present_report result');
        }
      }
    }

    // Add assistant message with tool calls + tool results to conversation
    currentMessages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    });

    for (const result of toolResults) {
      currentMessages.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: result.result,
      });
    }

    // Loop continues — will stream next LLM response with tool results
  }

  return {
    content: fullContent,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    reportData,
  };
}

/**
 * Handle chat:cancel event
 */
function handleChatCancel(socket: TypedSocket, io: TypedIO, payload: ChatCancelPayload): void {
  const { conversationId } = payload;
  console.log(`[Socket] chat:cancel from ${socket.id} - conversation: ${conversationId}`);

  const controller = activeStreams.get(conversationId);
  if (controller) {
    controller.abort();
    activeStreams.delete(conversationId);

    io.to(`conversation:${conversationId}`).emit('chat:done', {
      conversationId,
    });
  }
}

/**
 * Get room name for a conversation
 */
function getConversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Handle conversation:join event - join socket to conversation room
 */
function handleConversationJoin(socket: TypedSocket, payload: ConversationJoinPayload): void {
  const { conversationId } = payload;
  const room = getConversationRoom(conversationId);

  socket.join(room);
  console.log(`[Socket] ${socket.id} joined room ${room}`);
}

/**
 * Handle conversation:leave event - leave conversation room
 */
function handleConversationLeave(socket: TypedSocket, payload: ConversationLeavePayload): void {
  const { conversationId } = payload;
  const room = getConversationRoom(conversationId);

  socket.leave(room);
  console.log(`[Socket] ${socket.id} left room ${room}`);
}

/**
 * Broadcast a synced message to all sockets in the conversation room
 */
function broadcastMessageSynced(
  io: TypedIO,
  conversationId: string,
  message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string },
  originSocketId?: string
): void {
  const room = getConversationRoom(conversationId);
  const socketsInRoom = io.sockets.adapter.rooms.get(room);
  const socketCount = socketsInRoom?.size ?? 0;
  console.log(`[Broadcast] message:synced to room ${room} (${socketCount} sockets) - ${message.role} from ${originSocketId}`);
  io.to(room).emit('message:synced', {
    conversationId,
    message,
    originSocketId,
  });
}

/**
 * Register all socket handlers
 */
export function registerSocketHandlers(io: TypedIO): void {
  io.on('connection', (socket: TypedSocket) => {
    // Store connection timestamp
    socket.data.connectedAt = new Date();

    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send connection confirmation
    socket.emit('connection:status', {
      connected: true,
      socketId: socket.id,
    });

    // Register event handlers
    socket.on('chat:message', (payload) => handleChatMessage(socket, io, payload));
    socket.on('chat:cancel', (payload) => handleChatCancel(socket, io, payload));
    socket.on('conversation:join', (payload) => handleConversationJoin(socket, payload));
    socket.on('conversation:leave', (payload) => handleConversationLeave(socket, payload));

    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);

      // Cancel any active streams for this socket
      // Note: In production, you'd track streams per socket
    });
  });
}
