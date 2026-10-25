import { z } from 'astro/zod';
import { orTodo, text, url } from './common';

export const projectMethods = ['by-hand', 'ai-copilot', 'vibecoded'] as const;

export const projectSchema = z.strictObject({
  name: text,
  description: orTodo(text),
  repo: url,
  language: orTodo(text),
  method: orTodo(z.enum(projectMethods)),
  status: orTodo(z.enum(['active', 'wip', 'archived'])),
  featured: z.boolean(),
});

export const projectTranslatable = ['description'];
