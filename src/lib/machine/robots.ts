import { absoluteUrl } from '../i18n';

/** Crawler AI consentiti esplicitamente (decisione PORT-28: tutti). */
export const aiCrawlers = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Bytespider',
  'Meta-ExternalAgent',
  'cohere-ai',
  'Amazonbot',
  'DuckAssistBot',
  'MistralAI-User',
] as const;

/** Percorsi chiusi a tutti (area CMS, PORT-34). */
export const disallowed = ['/admin'] as const;

/**
 * Un gruppo per user-agent: in robots.txt un gruppo specifico sostituisce `*`, quindi il
 * Disallow va ripetuto in ognuno.
 */
export function renderRobotsTxt(): string {
  const group = (agent: string) => [
    `User-agent: ${agent}`,
    'Allow: /',
    ...disallowed.map((p) => `Disallow: ${p}`),
    '',
  ];
  return [
    '# AI crawlers are explicitly welcome: this portfolio is meant to be read by agents.',
    ...group('*'),
    ...aiCrawlers.flatMap(group),
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
}
