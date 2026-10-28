import { z } from 'astro/zod';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

/*
 * Validatori dei file per macchine pubblicati. Funzioni pure: restituiscono l'elenco dei
 * problemi (vuoto = ok). Usate dai test e dallo script `check:machine` sulla build reale.
 */

const https = z.url({ protocol: /^https$/ });
const bilingual = z.strictObject({ it: z.string().min(1), en: z.string().min(1) });
const origin = 'https://alessandrogorla.it';

const profileJsonSchema = z.strictObject({
  '@context': z.literal('https://schema.org'),
  '@type': z.literal('Person'),
  name: z.string().min(1),
  url: https,
  email: z.email(),
  jobTitle: z.string().min(1).optional(),
  homeLocation: z.strictObject({ '@type': z.literal('Place'), name: z.string().min(1) }),
  description: z.string().min(1).optional(),
  availability: z.string().min(1).optional(),
  sameAs: z.array(https).min(1),
  knowsAbout: z.array(z.string().min(1)),
  knowsLanguage: z.array(z.string().min(2)).min(1),
  pages: z.record(z.string(), bilingual),
  projects: z.array(
    z.strictObject({
      name: z.string().min(1),
      repository: https.optional(),
      description: bilingual.optional(),
      language: z.string().min(1).optional(),
      method: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
    }),
  ),
  primaryLanguage: z.literal('en'),
});

const str = z.string().min(1);
const ref = z.strictObject({ '@id': https });
const jsonLdNode = z.discriminatedUnion('@type', [
  z.strictObject({
    '@type': z.enum(['WebPage', 'ProfilePage']),
    '@id': https,
    url: https,
    name: str,
    inLanguage: z.enum(['it', 'en']),
    mainEntity: ref,
  }),
  z.strictObject({
    '@type': z.literal('Person'),
    '@id': https,
    name: str,
    url: https,
    email: z.email(),
    jobTitle: str.optional(),
    homeLocation: z.strictObject({ '@type': z.literal('Place'), name: str }),
    description: str.optional(),
    sameAs: z.array(https).min(1),
    knowsAbout: z.array(str),
    knowsLanguage: z.array(str).min(1),
    hasCredential: z
      .array(
        z.strictObject({
          '@type': z.literal('EducationalOccupationalCredential'),
          name: str,
          recognizedBy: z
            .strictObject({ '@type': z.literal('Organization'), name: str })
            .optional(),
          dateCreated: str.optional(),
          url: https.optional(),
        }),
      )
      .min(1)
      .optional(),
  }),
  z.strictObject({
    '@type': z.literal('SoftwareSourceCode'),
    name: str,
    codeRepository: https.optional(),
    description: str.optional(),
    programmingLanguage: str.optional(),
    author: ref,
  }),
]);
const jsonLdSchema = z.strictObject({
  '@context': z.literal('https://schema.org'),
  '@graph': z.array(jsonLdNode).min(2),
});

const issues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

/** profile.json: JSON valido, conforme allo schema e JSON-LD schema.org `Person`. */
export function validateProfileJson(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return [`JSON non valido: ${(e as Error).message}`];
  }
  const parsed = profileJsonSchema.safeParse(data);
  return parsed.success ? [] : issues(parsed.error);
}

/** llms.txt secondo llmstxt.org: un H1, blockquote, sezioni H2 con elenchi di link. */
export function validateLlmsTxt(text: string): string[] {
  const problems: string[] = [];
  const lines = text.split('\n');
  if (!/^# \S/.test(lines[0] ?? '')) problems.push('la prima riga deve essere un H1 (`# Nome`)');
  if (lines.filter((l) => /^# /.test(l)).length !== 1) problems.push('serve esattamente un H1');
  if (!lines.some((l) => /^> \S/.test(l))) problems.push('manca il blockquote di sintesi');
  const sections = lines.filter((l) => /^## \S/.test(l));
  if (sections.length === 0) problems.push('manca almeno una sezione H2');
  const linkLine = /^- \[[^\]]+\]\(https:\/\/[^)\s]+\)(: .+)?$/;
  for (const [i, line] of lines.entries()) {
    if (line.startsWith('- ') && !linkLine.test(line))
      problems.push(
        `riga ${i + 1}: voce di elenco non nel formato \`- [nome](https://url): note\``,
      );
  }
  if (!text.endsWith('\n')) problems.push('manca il newline finale');
  return problems;
}

/** agent.md: H1 con il nome e le sezioni attese. */
export function validateAgentMd(text: string): string[] {
  const problems: string[] = [];
  if (!/^# \S/.test(text)) problems.push('deve iniziare con un H1');
  for (const section of ['Contact', 'Skills', 'Projects', 'Pages'])
    if (!new RegExp(`^## ${section}$`, 'm').test(text))
      problems.push(`manca la sezione "${section}"`);
  return problems;
}

/** robots.txt: sitemap dichiarata, nessun blocco totale, ogni gruppo con User-agent. */
export function validateRobotsTxt(text: string): string[] {
  const problems: string[] = [];
  if (!new RegExp(`^Sitemap: ${origin}/sitemap\\.xml$`, 'm').test(text))
    problems.push('manca la riga Sitemap sull apex');
  if (/^Disallow: \/\s*$/m.test(text)) problems.push('Disallow: / blocca tutto il sito');
  if (!/^User-agent: \*$/m.test(text)) problems.push('manca il gruppo User-agent: *');
  return problems;
}

/** sitemap.xml: XML ben formato, voci https sull apex con alternate it, en e x-default. */
export function validateSitemapXml(xml: string): string[] {
  try {
    SyntaxValidator.validate(xml);
  } catch (e) {
    return [`XML non valido: ${(e as Error).message}`];
  }
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const urls: unknown = doc?.urlset?.url;
  if (!urls) return ['urlset senza voci <url>'];

  const problems: string[] = [];
  for (const entry of Array.isArray(urls) ? urls : [urls]) {
    const loc = String(entry?.loc ?? '');
    if (!loc.startsWith(`${origin}/`)) problems.push(`<loc> fuori dall apex https: ${loc}`);
    const alts = [entry?.['xhtml:link']].flat().filter(Boolean);
    const langs = alts.map((a: Record<string, string>) => a['@hreflang']);
    for (const need of ['it', 'en', 'x-default'])
      if (!langs.includes(need)) problems.push(`${loc}: manca l alternate ${need}`);
  }
  return problems;
}

export interface Finding {
  rule: 'ip-privato' | 'host-non-ammesso';
  match: string;
}

const octet = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
/** Prefisso con `fixed` ottetti gia fissati, completato dagli ottetti liberi. */
const ip = (prefix: string, fixed: number) => `${prefix}(?:\\.${octet}){${4 - fixed}}`;
const privateIp = new RegExp(
  `(?<![\\w.])(?:${[
    ip('10', 1),
    ip('127', 1),
    ip('169\\.254', 2),
    ip('192\\.168', 2),
    ip('172\\.(?:1[6-9]|2\\d|3[01])', 2),
    ip('100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])', 2),
  ].join('|')})(?![\\w]|\\.\\d)`,
  'g',
);
const ula = /(?<![\w:])f[cd][0-9a-f]{2}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi;
const hosts = /\b(?:[a-z0-9-]+\.)+(?:alessandrogorla\.it|lan|internal|home\.arpa)\b/gi;
const allowedHosts = new Set(['alessandrogorla.it', 'www.alessandrogorla.it']);

/** Cerca IP privati e hostname dell infrastruttura: apex e www sono gli unici nomi ammessi. */
export function scanText(text: string): Finding[] {
  const found: Finding[] = [];
  for (const m of text.matchAll(privateIp)) found.push({ rule: 'ip-privato', match: m[0] });
  for (const m of text.matchAll(ula)) found.push({ rule: 'ip-privato', match: m[0] });
  for (const m of text.matchAll(hosts))
    if (!allowedHosts.has(m[0].toLowerCase()))
      found.push({ rule: 'host-non-ammesso', match: m[0] });
  return found;
}

/**
 * JSON-LD di una pagina HTML: un solo blocco `application/ld+json`, conforme al sottoinsieme
 * schema.org che emettiamo (`Person`, pagina, `SoftwareSourceCode`), con riferimenti `@id` risolti,
 * una sola pagina e una sola persona, e nessun segnaposto.
 */
export function validateJsonLd(html: string): string[] {
  const blocks = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((m) => m[1] ?? '');
  if (blocks.length !== 1)
    return [`serve esattamente un blocco JSON-LD (trovati ${blocks.length})`];
  let data: unknown;
  try {
    data = JSON.parse(blocks[0] ?? '');
  } catch (e) {
    return [`JSON-LD non valido: ${(e as Error).message}`];
  }
  const parsed = jsonLdSchema.safeParse(data);
  if (!parsed.success) return issues(parsed.error);

  const problems: string[] = [];
  const graph = parsed.data['@graph'];
  const ids = new Set(graph.flatMap((n) => ('@id' in n ? [n['@id']] : [])));
  for (const n of graph) {
    const target = 'mainEntity' in n ? n.mainEntity['@id'] : 'author' in n ? n.author['@id'] : null;
    if (target && !ids.has(target)) problems.push(`riferimento @id non risolto: ${target}`);
  }
  const count = (types: string[]) => graph.filter((n) => types.includes(n['@type'])).length;
  if (count(['WebPage', 'ProfilePage']) !== 1) problems.push('serve esattamente una pagina');
  if (count(['Person']) !== 1) problems.push('serve esattamente una Person');
  if (/todo/i.test(blocks[0] ?? '')) problems.push('il JSON-LD contiene un segnaposto todo');
  return problems;
}
