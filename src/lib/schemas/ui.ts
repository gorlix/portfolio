import { z } from 'astro/zod';
import { text } from './common';

/** Stringhe dell'interfaccia: nessun testo vive nei componenti. */
export const uiSchema = z.strictObject({
  skipToContent: text,
  languageSwitcher: z.strictObject({
    label: text,
    /** Nomi delle lingue nella lingua stessa: identici in IT e EN. */
    it: text,
    en: text,
  }),
  notFound: z.strictObject({
    title: text,
    message: text,
    home: text,
  }),
});

export const uiTranslatable = [
  'skipToContent',
  'languageSwitcher.label',
  'notFound.title',
  'notFound.message',
  'notFound.home',
];
