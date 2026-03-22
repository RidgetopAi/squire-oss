/**
 * Lists Tools
 *
 * LLM tools for reading and searching user lists and their items.
 */

import {
  listLists,
  searchLists,
  getListWithItems,
  findListByName,
  getCompletionStats,
  createList,
  addItem,
  toggleItem,
} from '../services/lists.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// SEARCH LISTS TOOL
// =============================================================================

interface SearchListsArgs {
  query: string;
  limit?: number;
}

async function handleSearchLists(args: SearchListsArgs): Promise<string> {
  const { query, limit = 10 } = args;

  if (!query || query.trim().length === 0) {
    return JSON.stringify({ error: 'Query is required', lists: [] });
  }

  try {
    const lists = await searchLists(query, limit);

    if (lists.length === 0) {
      return JSON.stringify({
        message: `No lists found matching "${query}"`,
        lists: [],
      });
    }

    // Format lists for LLM consumption
    const formattedLists = lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      list_type: list.list_type,
      category: list.category,
      tags: list.tags,
      is_pinned: list.is_pinned,
      created_at: list.created_at,
      similarity: Math.round(list.similarity * 100) / 100,
    }));

    return JSON.stringify({
      count: lists.length,
      lists: formattedLists,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to search lists: ${message}`, lists: [] });
  }
}

// Exported in tools array below

// =============================================================================
// GET LIST ITEMS TOOL
// =============================================================================

interface GetListItemsArgs {
  name?: string;
  id?: string;
}

async function handleGetListItems(args: GetListItemsArgs): Promise<string> {
  const { name, id } = args;

  if (!name && !id) {
    return JSON.stringify({ error: 'Either name or id is required', list: null });
  }

  try {
    let list;

    if (id) {
      // Direct ID lookup
      list = await getListWithItems(id);
    } else if (name) {
      // Find by name (supports fuzzy matching)
      const foundList = await findListByName(name);
      if (foundList) {
        list = await getListWithItems(foundList.id);
      }
    }

    if (!list) {
      return JSON.stringify({
        message: id ? `List with ID "${id}" not found` : `List "${name}" not found`,
        list: null,
      });
    }

    // Get completion stats for checklists
    let stats = null;
    if (list.list_type === 'checklist') {
      stats = await getCompletionStats(list.id);
    }

    // Format items for LLM consumption
    const formattedItems = list.items
      .filter((item) => !item.archived_at) // Exclude archived items
      .map((item) => ({
        id: item.id,
        content: item.content,
        notes: item.notes,
        is_completed: item.is_completed,
        completed_at: item.completed_at,
        priority: item.priority,
        due_at: item.due_at,
        sort_order: item.sort_order,
      }));

    return JSON.stringify({
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        list_type: list.list_type,
        category: list.category,
        tags: list.tags,
        is_pinned: list.is_pinned,
        created_at: list.created_at,
        item_count: formattedItems.length,
        completion_stats: stats,
      },
      items: formattedItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get list items: ${message}`, list: null });
  }
}

// Exported in tools array below

// =============================================================================
// LIST ALL LISTS TOOL
// =============================================================================

interface ListAllListsArgs {
  limit?: number;
  list_type?: 'checklist' | 'simple' | 'ranked';
  category?: string;
}

async function handleListAllLists(args: ListAllListsArgs | null): Promise<string> {
  const { limit = 20, list_type, category } = args ?? {};

  try {
    const lists = await listLists({ limit, list_type, category });

    if (lists.length === 0) {
      return JSON.stringify({
        message: 'No lists found',
        lists: [],
      });
    }

    // Format lists for LLM consumption
    const formattedLists = lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      list_type: list.list_type,
      category: list.category,
      tags: list.tags,
      is_pinned: list.is_pinned,
      created_at: list.created_at,
    }));

    return JSON.stringify({
      count: lists.length,
      lists: formattedLists,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to list all lists: ${message}`, lists: [] });
  }
}

// Exported in tools array below

// =============================================================================
// CREATE LIST TOOL
// =============================================================================

interface CreateListArgs {
  name: string;
  description?: string;
  list_type?: 'checklist' | 'simple' | 'ranked';
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  items?: string[];
}

async function handleCreateList(args: CreateListArgs): Promise<string> {
  const { name, description, list_type = 'checklist', category, tags, is_pinned, items } = args;

  if (!name || name.trim().length === 0) {
    return JSON.stringify({ error: 'List name is required', list: null });
  }

  try {
    const list = await createList({
      name: name.trim(),
      description: description?.trim(),
      list_type,
      category: category?.trim(),
      tags,
      is_pinned,
    });

    // Add initial items if provided
    const addedItems: Array<{ id: string; content: string }> = [];
    if (items && items.length > 0) {
      for (const itemContent of items) {
        if (itemContent && itemContent.trim()) {
          const item = await addItem(list.id, { content: itemContent.trim() });
          addedItems.push({ id: item.id, content: item.content });
        }
      }
    }

    return JSON.stringify({
      message: `List "${list.name}" created successfully${addedItems.length > 0 ? ` with ${addedItems.length} items` : ''}`,
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        list_type: list.list_type,
        category: list.category,
        tags: list.tags,
        is_pinned: list.is_pinned,
        created_at: list.created_at,
        items: addedItems,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create list: ${message}`, list: null });
  }
}

// Exported in tools array below

// =============================================================================
// ADD LIST ITEM TOOL
// =============================================================================

interface AddListItemArgs {
  list_name?: string;
  list_id?: string;
  content: string;
  notes?: string;
  priority?: number;
}

async function handleAddListItem(args: AddListItemArgs): Promise<string> {
  const { list_name, list_id, content, notes, priority } = args;

  if (!list_name && !list_id) {
    return JSON.stringify({ error: 'Either list_name or list_id is required', item: null });
  }

  if (!content || content.trim().length === 0) {
    return JSON.stringify({ error: 'Item content is required', item: null });
  }

  try {
    let listId = list_id;

    // Find list by name if not provided by ID
    if (!listId && list_name) {
      const foundList = await findListByName(list_name);
      if (!foundList) {
        return JSON.stringify({
          error: `List "${list_name}" not found. Use create_list to create it first, or check the name with list_all_lists.`,
          item: null,
        });
      }
      listId = foundList.id;
    }

    const item = await addItem(listId!, {
      content: content.trim(),
      notes: notes?.trim(),
      priority,
    });

    return JSON.stringify({
      message: `Item added to list successfully`,
      item: {
        id: item.id,
        content: item.content,
        notes: item.notes,
        is_completed: item.is_completed,
        priority: item.priority,
        created_at: item.created_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to add item: ${message}`, item: null });
  }
}

// Exported in tools array below

// =============================================================================
// TOGGLE LIST ITEM TOOL
// =============================================================================

interface ToggleListItemArgs {
  list_name?: string;
  list_id?: string;
  item_content?: string;
  item_id?: string;
}

async function handleToggleListItem(args: ToggleListItemArgs): Promise<string> {
  const { list_name, list_id, item_content, item_id } = args;

  // Need either item_id directly, or list + item_content to find it
  if (!item_id && (!item_content || (!list_name && !list_id))) {
    return JSON.stringify({
      error: 'Either provide item_id, OR provide item_content with list_name/list_id to find the item',
      item: null,
    });
  }

  try {
    let targetItemId = item_id;

    // If no item_id, find the item by searching the list
    if (!targetItemId) {
      let listId = list_id;

      // Find list by name if needed
      if (!listId && list_name) {
        const foundList = await findListByName(list_name);
        if (!foundList) {
          return JSON.stringify({ error: `List "${list_name}" not found`, item: null });
        }
        listId = foundList.id;
      }

      // Get list with items
      const listWithItems = await getListWithItems(listId!);
      if (!listWithItems) {
        return JSON.stringify({ error: 'List not found', item: null });
      }

      // Find item by content (case-insensitive partial match)
      const searchContent = item_content!.toLowerCase();
      const matchingItem = listWithItems.items.find(
        (item) => !item.archived_at && item.content.toLowerCase().includes(searchContent)
      );

      if (!matchingItem) {
        return JSON.stringify({
          error: `No item matching "${item_content}" found in list "${listWithItems.name}"`,
          item: null,
        });
      }

      targetItemId = matchingItem.id;
    }

    // Toggle the item
    const updatedItem = await toggleItem(targetItemId);

    if (!updatedItem) {
      return JSON.stringify({ error: 'Failed to toggle item', item: null });
    }

    const statusText = updatedItem.is_completed ? 'completed' : 'marked incomplete';

    return JSON.stringify({
      message: `Item ${statusText}`,
      item: {
        id: updatedItem.id,
        content: updatedItem.content,
        is_completed: updatedItem.is_completed,
        completed_at: updatedItem.completed_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to toggle item: ${message}`, item: null });
  }
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'search_lists',
    description:
      'Search for a specific list by name or topic. Use when user asks to FIND a particular list (e.g., "find my grocery list", "do I have a list about movies?"). Do NOT use for listing all lists - use list_all_lists instead.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant lists (uses semantic similarity matching)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lists to return (default: 10, max: 50)',
        },
      },
      required: ['query'],
    },
    handler: handleSearchLists as ToolHandler,
  },
  {
    name: 'get_list_items',
    description:
      'Get a specific list and all its items. Use this when the user asks to see the contents of a list, what\'s on a list, or asks about specific items. You can find the list by name (fuzzy match supported) or ID.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the list to retrieve (supports fuzzy matching)',
        },
        id: {
          type: 'string',
          description: 'The exact UUID of the list (use if you already know the ID)',
        },
      },
      required: [],
    },
    handler: handleGetListItems as ToolHandler,
  },
  {
    name: 'list_all_lists',
    description:
      'Get ALL of the user\'s lists. Use this when the user asks "what lists do I have?", "show me my lists", or wants to see all their lists. This is the DEFAULT tool for viewing lists. Returns list names only - use get_list_items to see items in a specific list.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of lists to return (default: 20, max: 50)',
        },
        list_type: {
          type: 'string',
          enum: ['checklist', 'simple', 'ranked'],
          description: 'Filter by list type',
        },
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "work", "personal", "shopping")',
        },
      },
      required: [],
    },
    handler: handleListAllLists as ToolHandler,
  },
  {
    name: 'create_list',
    description:
      'Create a new list for the user. Use this when the user wants to start a new list, checklist, or to-do list. You can include initial items when creating the list.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the list (e.g., "Grocery List", "Project Tasks")',
        },
        description: {
          type: 'string',
          description: 'Optional description of what this list is for',
        },
        list_type: {
          type: 'string',
          enum: ['checklist', 'simple', 'ranked'],
          description: 'Type of list: checklist (items can be completed), simple (plain list), or ranked (ordered by priority). Default: checklist',
        },
        category: {
          type: 'string',
          description: 'Optional category (e.g., "work", "personal", "shopping")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for organization',
        },
        is_pinned: {
          type: 'boolean',
          description: 'Whether to pin this list as important (default: false)',
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional initial items to add to the list when creating it',
        },
      },
      required: ['name'],
    },
    handler: handleCreateList as ToolHandler,
  },
  {
    name: 'add_list_item',
    description:
      'Add an item to an existing list. Use this when the user wants to add something to a list. You can specify the list by name (fuzzy match supported) or ID.',
    parameters: {
      type: 'object',
      properties: {
        list_name: {
          type: 'string',
          description: 'The name of the list to add to (supports fuzzy matching)',
        },
        list_id: {
          type: 'string',
          description: 'The UUID of the list (use if you already have the ID)',
        },
        content: {
          type: 'string',
          description: 'The text content of the item to add',
        },
        notes: {
          type: 'string',
          description: 'Optional additional notes for the item',
        },
        priority: {
          type: 'number',
          description: 'Optional priority level (1-5, where 1 is highest)',
        },
      },
      required: ['content'],
    },
    handler: handleAddListItem as ToolHandler,
  },
  {
    name: 'toggle_list_item',
    description:
      'Toggle a list item between completed and incomplete. Use this when the user wants to check off an item, mark something done, or uncheck an item. You can find the item by its content (partial match) within a list, or by item_id if you have it.',
    parameters: {
      type: 'object',
      properties: {
        list_name: {
          type: 'string',
          description: 'The name of the list containing the item (supports fuzzy matching)',
        },
        list_id: {
          type: 'string',
          description: 'The UUID of the list (use if you already have it)',
        },
        item_content: {
          type: 'string',
          description: 'Text to search for in item content (partial match, case-insensitive)',
        },
        item_id: {
          type: 'string',
          description: 'The UUID of the item to toggle (use if you already have it)',
        },
      },
      required: [],
    },
    handler: handleToggleListItem as ToolHandler,
  },
];
