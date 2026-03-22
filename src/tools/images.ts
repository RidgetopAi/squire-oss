/**
 * Image Analysis Tool
 *
 * Allows Squire to analyze stored images on demand.
 * Uses vision-enabled LLM to describe or extract info from images.
 */

import type { ToolSpec } from './types.js';
import { getObjectById, getObjectData } from '../services/objects.js';
import { callLLM, type ImageContent } from '../services/llm/index.js';

/**
 * Convert mime type to valid ImageContent mediaType
 */
function toMediaType(mimeType: string): ImageContent['mediaType'] | null {
  const validTypes: ImageContent['mediaType'][] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (validTypes.includes(mimeType as ImageContent['mediaType'])) {
    return mimeType as ImageContent['mediaType'];
  }
  return null;
}

/**
 * Analyze an image using vision model
 */
async function analyzeImage(args: unknown): Promise<string> {
  const { objectId, prompt = 'Describe this image in detail.' } = args as {
    objectId: string;
    prompt?: string;
  };

  // Get object metadata
  const obj = await getObjectById(objectId);
  if (!obj) {
    return `Error: Object with ID '${objectId}' not found.`;
  }

  if (obj.object_type !== 'image') {
    return `Error: Object '${objectId}' is not an image (type: ${obj.object_type}).`;
  }

  // Get image data
  const data = await getObjectData(objectId);
  if (!data) {
    return `Error: Could not read image data for '${objectId}'.`;
  }

  // Validate and convert mime type
  const mediaType = toMediaType(obj.mime_type);
  if (!mediaType) {
    return `Error: Unsupported image format '${obj.mime_type}'. Supported: jpeg, png, gif, webp.`;
  }

  // Build image content
  const imageContent: ImageContent = {
    data: data.toString('base64'),
    mediaType,
  };

  // Call vision model
  try {
    const response = await callLLM([
      {
        role: 'user',
        content: prompt,
        images: [imageContent],
      },
    ]);

    return response.content || 'No description generated.';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error analyzing image: ${message}`;
  }
}

/**
 * List recent images
 */
async function listImages(args: unknown): Promise<string> {
  const { limit = 10 } = args as { limit?: number };

  // Import here to avoid circular dependency
  const { listObjects } = await import('../services/objects.js');

  const images = await listObjects({
    objectType: 'image',
    status: 'active',
    limit,
  });

  if (images.length === 0) {
    return 'No images found in storage.';
  }

  const lines = images.map((img) => {
    const sizeKB = Math.round(img.size_bytes / 1024);
    const date = img.created_at.toLocaleDateString();
    return `- **${img.name}** (ID: ${img.id})\n  ${sizeKB}KB, ${img.mime_type}, uploaded ${date}`;
  });

  return `Found ${images.length} image(s):\n\n${lines.join('\n\n')}`;
}

export const tools: ToolSpec[] = [
  {
    name: 'analyze_image',
    description:
      'Analyze a stored image using vision. Provide the object ID and an optional prompt describing what to look for or describe.',
    parameters: {
      type: 'object',
      properties: {
        objectId: {
          type: 'string',
          description: 'The ID of the stored image object to analyze.',
        },
        prompt: {
          type: 'string',
          description:
            'What to analyze or describe about the image. Default: "Describe this image in detail."',
        },
      },
      required: ['objectId'],
    },
    handler: analyzeImage,
  },
  {
    name: 'list_images',
    description: 'List recently uploaded images in storage. Returns image names, IDs, and metadata.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of images to list (default: 10).',
        },
      },
      required: [],
    },
    handler: listImages,
  },
];
