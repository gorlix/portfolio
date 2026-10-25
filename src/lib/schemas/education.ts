import { z } from 'astro/zod';
import { isoDate, orTodo, text } from './common';

export const educationSchema = z.strictObject({
  institution: orTodo(text),
  degree: orTodo(text),
  start: orTodo(isoDate),
  /** `null` = in corso. */
  end: orTodo(isoDate.nullable()),
});

export const educationTranslatable = ['degree'];
