'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useDetailItem,
  useDetailModalOpen,
  useCloseDetailModal,
  type DetailItem,
} from '@/lib/stores/detailModalStore';
import { useEntityDetails } from '@/lib/hooks';
import type {
  Memory,
  Belief,
  Pattern,
  Entity,
  EntityDetail as EntityDetailType,
  EntityType,
  Insight,
  LivingSummary,
} from '@/lib/types';
import { formatRelativeTime, formatDateTime, formatSalience, formatConfidence, capitalize } from '@/lib/utils/formatting';

export function DetailModal() {
  const item = useDetailItem();
  const isOpen = useDetailModalOpen();
  const close = useCloseDetailModal();

  // Close on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  }, [close]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && item && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={close}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-2xl md:w-full md:max-h-[80vh] z-50 glass rounded-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <h2 className="text-lg font-semibold text-foreground">
                {getItemTitle(item)}
              </h2>
              <button
                onClick={close}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              <DetailContent item={item} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function getItemTitle(item: DetailItem): string {
  switch (item.type) {
    case 'memory': return 'Memory';
    case 'belief': return 'Belief';
    case 'pattern': return 'Pattern';
    case 'entity': return item.data.name;
    case 'insight': return 'Insight';
    case 'summary': return `${capitalize(item.data.category)} Summary`;
  }
}

function DetailContent({ item }: { item: DetailItem }) {
  switch (item.type) {
    case 'memory': return <MemoryDetail memory={item.data} />;
    case 'belief': return <BeliefDetail belief={item.data} />;
    case 'pattern': return <PatternDetail pattern={item.data} />;
    case 'entity': return <EntityDetail entity={item.data} />;
    case 'insight': return <InsightDetail insight={item.data} />;
    case 'summary': return <SummaryDetail summary={item.data} />;
  }
}

// Memory Detail
function MemoryDetail({ memory }: { memory: Memory }) {
  return (
    <div className="space-y-4">
      <div className="prose prose-invert max-w-none">
        <p className="text-foreground leading-relaxed whitespace-pre-wrap">{memory.content}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Source" value={capitalize(memory.source)} />
        <MetaItem label="Salience" value={formatSalience(memory.salience)} />
        <MetaItem label="Created" value={formatDateTime(memory.created_at)} />
        <MetaItem label="Updated" value={formatRelativeTime(memory.updated_at)} />
      </div>

      {memory.entities && memory.entities.length > 0 && (
        <div className="pt-4 border-t border-glass-border">
          <h4 className="text-sm font-medium text-foreground-muted mb-2">Entities</h4>
          <div className="flex flex-wrap gap-2">
            {memory.entities.map((e) => (
              <span key={e.id} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Belief Detail
function BeliefDetail({ belief }: { belief: Belief }) {
  return (
    <div className="space-y-4">
      <p className="text-foreground text-lg leading-relaxed">{belief.statement}</p>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Category" value={capitalize(belief.category)} />
        <MetaItem label="Confidence" value={formatConfidence(belief.confidence)} />
        <MetaItem label="Status" value={capitalize(belief.status)} />
        <MetaItem label="Evidence" value={`${belief.evidence_count} memories`} />
        <MetaItem label="First Observed" value={formatDateTime(belief.first_observed)} />
        <MetaItem label="Last Reinforced" value={formatRelativeTime(belief.last_reinforced)} />
      </div>
    </div>
  );
}

// Pattern Detail
function PatternDetail({ pattern }: { pattern: Pattern }) {
  return (
    <div className="space-y-4">
      <p className="text-foreground text-lg leading-relaxed">{pattern.description}</p>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Type" value={capitalize(pattern.type)} />
        <MetaItem label="Confidence" value={formatConfidence(pattern.confidence)} />
        <MetaItem label="Frequency" value={`${pattern.frequency}× observed`} />
        <MetaItem label="First Detected" value={formatDateTime(pattern.first_detected)} />
        <MetaItem label="Last Detected" value={formatRelativeTime(pattern.last_detected)} />
      </div>

      {pattern.examples && pattern.examples.length > 0 && (
        <div className="pt-4 border-t border-glass-border">
          <h4 className="text-sm font-medium text-foreground-muted mb-2">Examples</h4>
          <ul className="space-y-2">
            {pattern.examples.map((example, i) => (
              <li key={i} className="text-sm text-foreground bg-background-tertiary/50 rounded-lg p-3">
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Entity Detail - Fetches enriched data with memories and connections
function EntityDetail({ entity }: { entity: Entity }) {
  const { data: enrichedEntity, isLoading, error } = useEntityDetails(entity.id);

  // Entity type icons
  const typeIcons: Record<string, string> = {
    person: '👤',
    organization: '🏢',
    location: '📍',
    project: '📁',
    concept: '💡',
    event: '📅',
  };

  return (
    <div className="space-y-4">
      {/* Header with name, type, and relationship */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{getEntityIcon(entity.type)}</span>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-foreground">{entity.name}</h3>
          <div className="flex items-center gap-2">
            <p className="text-sm text-foreground-muted">{capitalize(entity.type)}</p>
            {enrichedEntity?.primary_relationship && (
              <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                {enrichedEntity.primary_relationship}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Mentions" value={`${entity.mention_count}×`} />
        <MetaItem label="First Seen" value={formatDateTime(entity.first_seen)} />
        <MetaItem label="Last Seen" value={formatRelativeTime(entity.last_seen)} />
        {enrichedEntity?.connected_entities && (
          <MetaItem label="Connected To" value={`${enrichedEntity.connected_entities.length} entities`} />
        )}
      </div>

      {/* Aliases */}
      {entity.aliases && entity.aliases.length > 0 && (
        <div className="pt-4 border-t border-glass-border">
          <h4 className="text-sm font-medium text-foreground-muted mb-2">Also Known As</h4>
          <div className="flex flex-wrap gap-2">
            {entity.aliases.map((alias, i) => (
              <span key={i} className="px-2 py-1 rounded-full bg-background-tertiary text-foreground-muted text-xs">
                {alias}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connected Entities */}
      {isLoading ? (
        <div className="pt-4 border-t border-glass-border">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-32 bg-background-tertiary rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-24 bg-background-tertiary rounded-lg" />
              <div className="h-8 w-20 bg-background-tertiary rounded-lg" />
              <div className="h-8 w-28 bg-background-tertiary rounded-lg" />
            </div>
          </div>
        </div>
      ) : enrichedEntity?.connected_entities && enrichedEntity.connected_entities.length > 0 ? (
        <div className="pt-4 border-t border-glass-border">
          <h4 className="text-sm font-medium text-foreground-muted mb-2">Connected Entities</h4>
          <div className="flex flex-wrap gap-2">
            {enrichedEntity.connected_entities.map((connected) => (
              <div
                key={connected.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background-tertiary/50 border border-glass-border text-sm"
              >
                <span>{typeIcons[connected.entity_type] || '📌'}</span>
                <span className="text-foreground">{connected.name}</span>
                <span className="text-foreground-muted text-xs">
                  ({connected.shared_memory_count})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Related Memories */}
      {isLoading ? (
        <div className="pt-4 border-t border-glass-border">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-32 bg-background-tertiary rounded" />
            <div className="h-16 bg-background-tertiary rounded-lg" />
            <div className="h-16 bg-background-tertiary rounded-lg" />
          </div>
        </div>
      ) : enrichedEntity?.memories && enrichedEntity.memories.length > 0 ? (
        <div className="pt-4 border-t border-glass-border">
          <h4 className="text-sm font-medium text-foreground-muted mb-2">
            Related Memories ({enrichedEntity.memories.length})
          </h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
            {enrichedEntity.memories.slice(0, 5).map((memory) => (
              <div
                key={memory.id}
                className="p-3 rounded-lg bg-background-tertiary/50 border border-glass-border"
              >
                <p className="text-sm text-foreground line-clamp-2">{memory.content}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-foreground-muted">
                    {formatRelativeTime(memory.created_at)}
                  </span>
                  {memory.relationship_type && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {memory.relationship_type}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {enrichedEntity.memories.length > 5 && (
              <p className="text-xs text-foreground-muted text-center py-1">
                +{enrichedEntity.memories.length - 5} more memories
              </p>
            )}
          </div>
        </div>
      ) : null}

      {error && (
        <div className="pt-4 border-t border-glass-border">
          <p className="text-sm text-error">Failed to load entity details</p>
        </div>
      )}
    </div>
  );
}

// Insight Detail
function InsightDetail({ insight }: { insight: Insight }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{getInsightIcon(insight.type)}</span>
        <p className="text-foreground text-lg leading-relaxed">{insight.content}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Type" value={capitalize(insight.type)} />
        <MetaItem label="Priority" value={capitalize(insight.priority)} />
        <MetaItem label="Status" value={capitalize(insight.status)} />
        <MetaItem label="Sources" value={`${insight.source_memories?.length || 0} memories`} />
        <MetaItem label="Created" value={formatDateTime(insight.created_at)} />
      </div>
    </div>
  );
}

// Summary Detail
function SummaryDetail({ summary }: { summary: LivingSummary }) {
  return (
    <div className="space-y-4">
      <div className="prose prose-invert max-w-none">
        <p className="text-foreground leading-relaxed whitespace-pre-wrap">{summary.content}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <MetaItem label="Category" value={capitalize(summary.category)} />
        <MetaItem label="Version" value={`v${summary.version}`} />
        <MetaItem label="Memories" value={`${summary.memory_count} contributing`} />
        <MetaItem label="Last Updated" value={formatRelativeTime(summary.last_updated)} />
      </div>
    </div>
  );
}

// Helper Components
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-foreground-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

function getEntityIcon(type: string): string {
  const icons: Record<string, string> = {
    person: '👤',
    organization: '🏢',
    location: '📍',
    project: '📁',
    concept: '💡',
    event: '📅',
  };
  return icons[type] || '📌';
}

function getInsightIcon(type: string): string {
  const icons: Record<string, string> = {
    connection: '🔗',
    contradiction: '⚠️',
    opportunity: '✨',
    warning: '🚨',
    realization: '💡',
  };
  return icons[type] || '💡';
}

export default DetailModal;
