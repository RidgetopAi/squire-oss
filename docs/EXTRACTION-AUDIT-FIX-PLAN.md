# Squire Extraction System Fix Plan

**Created:** December 30, 2025
**Status:** Planning
**Audit Data:** 2.5 days production (96 messages, 101 memories, 47 entities)

---

## Problem Summary

After auditing 2.5 days of production data, we identified three issues:

| Issue | Severity | Examples |
|-------|----------|----------|
| Entity false positives | Critical | "Appomattox County" as person, "two" as project |
| Same-name confusion | High | Two different "Ricks" would merge into one entity |
| Duplicate reminders/commitments | Moderate | 6 duplicate reminder pairs |

---

## Phase 1: Stop the Bleeding (Quick Fixes)

**Goal:** Eliminate obvious false positives with minimal code changes.

### 1.1 Expand Stop Words List
**File:** `src/services/entities.ts` (line ~138)

Add to `STOP_WORDS`:
```
// Place/org indicators
County, Oncology, Hospital, Clinic, Center, Calendar, Palace,
Chinese, Restaurant, Church, School, University, Medical, Dental

// Numbers that get capitalized
One, Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten

// Verbs that match patterns
Connecting, Integrating, Working, Planning, Meeting, Starting
```

### 1.2 Fix Case-Insensitive Regex Bug
**File:** `src/services/entities.ts` (line ~115)

Change project regex from `/gi` to `/g`:
```javascript
// Before (matches "working on two")
/\bworking on\s+(?:the\s+)?([A-Z][a-zA-Z0-9]+)\b/gi

// After (requires capitalized word)
/\bworking on\s+(?:the\s+)?([A-Z][a-zA-Z0-9]+)\b/g
```

### 1.3 Add Deduplication to Reminders
**File:** `src/services/reminders.ts`

Before creating reminder, check:
```sql
SELECT id FROM reminders
WHERE title = $1 AND DATE(scheduled_for) = DATE($2)
```
If exists, return existing instead of creating duplicate.

### 1.4 Add Deduplication to Commitments
**File:** `src/services/commitments.ts`

Same pattern as reminders.

**Phase 1 Deliverable:** No more junk entities like "two", "connecting", "Appomattox County as person". No duplicate reminders/commitments.

---

## Phase 2: Smarter Entity Classification

**Goal:** Add validation layer that catches misclassifications LLM or regex might make.

### 2.1 Create Entity Validator Function
**New function in:** `src/services/entities.ts`

```typescript
function validateEntityType(
  name: string,
  proposedType: EntityType,
  context: string
): EntityType {
  // Override rules based on name patterns
  const lowerName = name.toLowerCase();

  // Place indicators
  if (/county|city|state|village|township/.test(lowerName)) {
    return 'place';
  }

  // Organization indicators
  if (/hospital|clinic|oncology|medical|dental|flooring|restaurant/.test(lowerName)) {
    return 'organization';
  }

  // Product indicators
  if (/calendar|maps|drive|docs|sheets/.test(lowerName)) {
    return 'concept'; // or 'product' if we add that type
  }

  return proposedType; // No override needed
}
```

### 2.2 Integrate Validator into Extraction Flow

Call `validateEntityType()` after LLM extraction, before storing:
```typescript
const validated = validateEntityType(
  extracted.name,
  extracted.type,
  extracted.context
);
extracted.type = validated;
```

**Phase 2 Deliverable:** Even if LLM says "Gastro Oncology" is a person, validator corrects to organization.

---

## Phase 3: Entity Disambiguation (The Rick Problem)

**Goal:** When two people share a name, keep them as separate entities.

### 3.1 Change Entity Lookup Logic
**File:** `src/services/entities.ts` - `getOrCreateEntity()`

Current (merges all same-name entities):
```typescript
const existing = await pool.query(
  `SELECT * FROM entities
   WHERE canonical_name = $1 AND entity_type = $2`,
  [canonical, extracted.type]
);
if (existing.rows.length > 0) {
  // Always updates existing - WRONG for different people
}
```

New (checks if truly same entity):
```typescript
const candidates = await pool.query(
  `SELECT * FROM entities
   WHERE canonical_name = $1 AND entity_type = $2`,
  [canonical, extracted.type]
);

if (candidates.rows.length > 0) {
  // Ask: Is this the same entity or a different one?
  const match = await disambiguateEntity(extracted, candidates.rows);
  if (match) {
    // Update existing
  } else {
    // Create new with distinguishing info
  }
}
```

### 3.2 Create Disambiguation Function

```typescript
async function disambiguateEntity(
  newEntity: ExtractedEntity,
  candidates: Entity[]
): Promise<Entity | null> {

  // If only one candidate with strong relationship match, use it
  if (candidates.length === 1) {
    const candidate = candidates[0];
    const candidateRel = candidate.attributes?.initial_relationship;
    const newRel = newEntity.relationship_type;

    // Same relationship context = same person
    if (candidateRel && newRel && candidateRel === newRel) {
      return candidate;
    }

    // Different relationship context = different person
    if (candidateRel && newRel && candidateRel !== newRel) {
      return null; // Create new entity
    }
  }

  // Multiple candidates or unclear - use LLM
  return await llmDisambiguate(newEntity, candidates);
}
```

### 3.3 LLM Disambiguation Prompt

```typescript
const DISAMBIGUATION_PROMPT = `
Given this new mention of "${name}":
Context: "${mentionContext}"
Relationship: "${relationship || 'unknown'}"

Is this the same person as any of these existing entities?
${candidates.map((c, i) =>
  `${i+1}. ${c.name} - ${c.attributes?.initial_relationship || 'no relationship'} - ${c.description || 'no description'}`
).join('\n')}

Respond with ONLY:
- The number (1, 2, etc.) if it matches an existing entity
- "NEW" if this is a different person

Do not explain.`;
```

### 3.4 Store Distinguishing Information

When creating a new entity that shares a name:
```typescript
// Add context to aliases for future matching
aliases: [`${name} (${relationship})`, `${name} from ${company}`]

// Store rich attributes
attributes: {
  initial_relationship: relationship,
  company: companyContext,
  introduced_via: howTheyWereMentioned
}
```

**Phase 3 Deliverable:** "Rick (brother-in-law)" and "Rick (Central VA Flooring dealer)" stay as separate entities.

---

## Phase 4: LLM-Primary Extraction (Optional Enhancement)

**Goal:** Shift from regex-primary to LLM-primary extraction.

This phase is optional - Phases 1-3 fix the critical issues. Phase 4 improves overall quality.

### 4.1 Refactor Extraction Flow

Current:
```
Regex extracts → LLM fills gaps → Store
```

New:
```
LLM extracts all → Validator corrects types → Disambiguator checks duplicates → Store
```

### 4.2 Simplify Regex Role

Keep regex only for:
- Performance optimization (skip LLM if no capitalized words)
- Fallback if LLM fails

**Phase 4 Deliverable:** Cleaner architecture, better extraction quality, regex as helper not primary.

---

## Implementation Order

```
Phase 1 (Session 1)
├── 1.1 Stop words ────────── 15 min
├── 1.2 Regex fix ─────────── 5 min
├── 1.3 Reminder dedup ────── 20 min
└── 1.4 Commitment dedup ──── 20 min
                              ≈ 1 hour

Phase 2 (Session 1-2)
├── 2.1 Validator function ── 30 min
└── 2.2 Integrate validator ─ 15 min
                              ≈ 45 min

Phase 3 (Session 2-3)
├── 3.1 Change lookup ─────── 30 min
├── 3.2 Disambiguate func ─── 45 min
├── 3.3 LLM prompt ────────── 30 min
└── 3.4 Store context ─────── 30 min
                              ≈ 2-3 hours

Phase 4 (Future, optional)
└── Full refactor ─────────── 2-3 hours
```

---

## Testing Checkpoints

After each phase, verify:

### Phase 1 Checkpoint
```sql
-- Should return 0 rows (no junk entities)
SELECT name FROM entities
WHERE name IN ('two', 'connecting', 'integrating', 'side');

-- Should return 0 rows (no duplicate reminders)
SELECT title, COUNT(*) FROM reminders
GROUP BY title, DATE(scheduled_for) HAVING COUNT(*) > 1;
```

### Phase 2 Checkpoint
```sql
-- "County" names should be places, not people
SELECT name, entity_type FROM entities
WHERE name ILIKE '%county%' AND entity_type != 'place';
-- Should return 0 rows
```

### Phase 3 Checkpoint
- Create test: mention "Rick the dealer" when "Rick (brother-in-law)" exists
- Verify: Two separate Rick entities created
- Verify: Future mentions link to correct Rick based on context

---

## Files Modified

| Phase | File | Changes |
|-------|------|---------|
| 1 | `src/services/entities.ts` | Stop words, regex fix |
| 1 | `src/services/reminders.ts` | Deduplication check |
| 1 | `src/services/commitments.ts` | Deduplication check |
| 2 | `src/services/entities.ts` | Add validateEntityType() |
| 3 | `src/services/entities.ts` | Rewrite getOrCreateEntity(), add disambiguateEntity() |

---

## Out of Scope (For Now)

- Merging existing duplicate entities (manual cleanup later)
- UI for entity management
- Bulk re-extraction of historical data
- Changes to beliefs/memories extraction

---

## Success Criteria

1. No new junk entities created (two, connecting, County-as-person)
2. No duplicate reminders or commitments
3. Same-name people stay separate when context differs
4. Existing functionality unchanged (memories, beliefs, notes, lists)
