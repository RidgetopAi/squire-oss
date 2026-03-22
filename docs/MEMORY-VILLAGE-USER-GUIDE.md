# Memory Village User Guide

Memory Village is a 3D visualization that transforms your memories into a medieval village. Buildings represent memories, light beams show connections, and villagers represent entities (people, places, things) from your life.

## Building Colors (Memory Categories)

Each building type represents a category of memory, displayed with a distinct color:

| Building | Color | Memory Type | Examples |
|----------|-------|-------------|----------|
| Tavern | Pink (#f472b6) | Social | Friends, family, relationships, conversations, parties |
| Library | Blue (#60a5fa) | Learning | Studies, books, courses, skills, training, discoveries |
| Blacksmith | Orange (#fb923c) | Work | Projects, career, deadlines, coding, deliverables |
| Church | Violet (#a78bfa) | Reflection | Journaling, meditation, self-insight, growth, goals |
| Market | Emerald (#34d399) | Travel | Trips, vacations, adventures, destinations, journeys |
| Barracks | Yellow (#facc15) | Health | Exercise, fitness, wellness, doctor visits, nutrition |
| House | Gray (#71717a) | Misc | Uncategorized or general memories |

### How Memories Are Categorized

Squire automatically categorizes memories based on keywords in the content and tags. For example:
- Memories mentioning "friend", "family", or "conversation" become **Taverns**
- Memories about "work", "project", or "code" become **Blacksmiths**
- Memories with "learn", "book", or "course" become **Libraries**

## Light Beam Colors (Memory Connections)

When you click a building, animated curved light beams appear showing how that memory connects to others. Each color indicates the relationship type:

| Color | Edge Type | Meaning |
|-------|-----------|---------|
| Blue (#3b82f6) | SIMILAR | Memories with similar content or topics |
| Green (#22c55e) | TEMPORAL | Memories close together in time |
| Amber (#f59e0b) | CAUSAL | Cause-and-effect relationships |
| Violet (#8b5cf6) | CO_OCCURS | Memories that happened around the same context |
| Pink (#ec4899) | MENTIONS | Shared entity mentions (same person, place, etc.) |

## Districts

Buildings are organized into districts based on their category:
- **North**: Learning (Libraries)
- **East**: Social (Taverns)
- **West**: Work (Blacksmiths)
- **South**: Reflection (Churches)
- **Southwest**: Travel (Markets)
- **Southeast**: Health (Barracks)
- **Far South**: Misc (Houses)

Higher-salience memories appear closer to district centers.

## Villagers

Entities mentioned in your memories (people, organizations, places) appear as villagers standing near the buildings they're most connected to:

| Entity Type | Villager Appearance |
|-------------|---------------------|
| Person | Peasant |
| Organization | Merchant |
| Concept | Scholar |
| Location | Guard |

## Props and Decorations

Each district has themed decorations:
- **Tavern districts**: Barrels, buckets, sacks
- **Library districts**: Crates, barrels (books/storage)
- **Blacksmith districts**: Barrels, wheelbarrows, crates
- **Church districts**: Rocks, buckets (peaceful)
- **Market districts**: Crates, sacks (goods)

Trees and rocks are scattered throughout for atmosphere.

## Interaction

- **Click** a building to select it and reveal its connections
- **Hover** over buildings to highlight them
- **Scroll** to zoom in/out
- **Drag** to rotate the camera around the village
- Selected building shows the memory content in a side panel

## Performance

- Maximum of 120 buildings displayed
- Memories are sorted by salience (importance)
- Lower-salience memories are filtered when over the cap
- Villagers capped at 30 for smooth performance

---

*Memory Village uses the KayKit Medieval Hexagon Pack (CC0 license) for 3D assets.*
