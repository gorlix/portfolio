import type { MachineModel } from './model';

/*
 * Rendering puro (testabile senza Astro) dei file per macchine. Lingua principale: inglese;
 * l'italiano compare come riferimento (URL gemelli, descrizioni, gruppi). Nessun segnaposto:
 * i dati ancora mancanti (`todo`) sono semplicemente omessi.
 */

const pageNotes: Record<string, string> = {
  home: 'Entry terminal: pick Human, Recruiter or AI Agent',
  recruiter: 'Formal one-page profile: skills, experience, projects, contacts',
  agent: 'Terminal-style showcase of the machine-readable files',
  human: 'Immersive 3D experience (JavaScript, WebGL)',
  trimind: 'Deep dive on the Trimind engagement, in five 3D moments (JavaScript, WebGL)',
};

const pageTitles: Record<string, string> = {
  home: 'Home',
  recruiter: 'Recruiter profile',
  agent: 'Agent view',
  human: 'Human experience',
  trimind: 'Trimind deep dive',
};

const rootFiles = [
  ['llms.txt', 'This index'],
  ['agent.md', 'Full profile in Markdown'],
  ['profile.json', 'Structured profile (schema.org Person)'],
  ['robots.txt', 'Crawler policy'],
  ['sitemap.xml', 'Sitemap'],
] as const;

const groupBy = <T>(items: T[], key: (item: T) => string): [string, T[]][] => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups];
};

const summary = (m: MachineModel): string => {
  const parts = [m.role?.en, `based in ${m.location.en}`, m.availability?.en].filter(Boolean);
  return m.role ? parts.join(' · ') : `Portfolio of ${m.name}, ${parts.join(' · ')}`;
};

const site = (m: MachineModel): string => new URL(m.pages[0]?.urls.en ?? '/').origin;

/** llms.txt secondo llmstxt.org: H1, blockquote, sezioni di link. */
export function renderLlmsTxt(m: MachineModel): string {
  const out = [`# ${m.name}`, ''];
  out.push(`> ${summary(m)}`, '');
  out.push(
    'English is the primary language of these files; Italian is available on the mirrored pages (no `/en` prefix).',
    '',
  );

  out.push('## Pages', '');
  for (const p of m.pages)
    out.push(`- [${pageTitles[p.id]}](${p.urls.en}): ${pageNotes[p.id]}. Italian: ${p.urls.it}`);

  out.push('', '## Machine-readable files', '');
  for (const [file, note] of rootFiles) out.push(`- [${file}](${site(m)}/${file}): ${note}`);

  out.push('', '## Projects', '');
  // llms.txt elenca solo voci con link: un progetto senza repository pubblico sta in agent.md e profile.json.
  for (const p of m.projects)
    if (p.repo) out.push(`- [${p.name}](${p.repo})${p.description ? `: ${p.description.en}` : ''}`);

  out.push('', '## Optional', '');
  out.push(`- [GitHub](${m.links.github})`, `- [LinkedIn](${m.links.linkedin})`);
  out.push(`- [X](${m.links.x})`);
  if (m.links.devto) out.push(`- [dev.to](${m.links.devto})`);
  return `${out.join('\n')}\n`;
}

/** agent.md: profilo completo in Markdown, EN con riferimenti IT. */
export function renderAgentMd(m: MachineModel): string {
  const out = [`# ${m.name}`, ''];
  if (m.role) out.push(`**Role:** ${m.role.en} _(it: ${m.role.it})_`, '');
  out.push(`**Location:** ${m.location.en} _(it: ${m.location.it})_`, '');
  if (m.availability)
    out.push(`**Availability:** ${m.availability.en} _(it: ${m.availability.it})_`, '');
  if (m.tagline) out.push(`> ${m.tagline.en}`, '', `_it:_ ${m.tagline.it}`, '');

  out.push('## Contact', '', `- Email: ${m.email}`);
  out.push(`- GitHub: ${m.links.github}`, `- LinkedIn: ${m.links.linkedin}`);
  out.push(`- X: ${m.links.x}`);
  if (m.links.devto) out.push(`- dev.to: ${m.links.devto}`);

  out.push('', '## Skills', '');
  for (const [group, skills] of groupBy(m.skills, (s) => s.group.en)) {
    const it = skills[0]?.group.it;
    const names = skills.map((s) => (s.kind === 'supplementary' ? `${s.name} (minor)` : s.name));
    out.push(`- **${group}**${it && it !== group ? ` _(it: ${it})_` : ''}: ${names.join(', ')}`);
  }

  out.push('', '## Projects', '');
  for (const p of m.projects) {
    const facts = [
      p.language && `language: ${p.language}`,
      p.method && `method: ${p.method}`,
      p.status && `status: ${p.status}`,
    ].filter(Boolean);
    out.push(`### ${p.name}`, '');
    if (p.repo) out.push(`- Repository: ${p.repo}`);
    if (facts.length) out.push(`- ${facts.join('; ')}`);
    if (p.description) out.push('', p.description.en, '', `_it:_ ${p.description.it}`);
    out.push('');
  }

  out.push('## Pages', '');
  for (const p of m.pages) out.push(`- ${pageTitles[p.id]}: ${p.urls.en} (it: ${p.urls.it})`);
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** profile.json: schema.org Person con `inLanguage` e URL gemelli. */
export function renderProfileJson(m: MachineModel): string {
  const sameAs = [m.links.github, m.links.linkedin, m.links.x, m.links.devto].filter(Boolean);
  const home = m.pages[0];
  const profile = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: m.name,
    url: home?.urls.en,
    email: m.email,
    ...(m.role && { jobTitle: m.role.en }),
    homeLocation: { '@type': 'Place', name: m.location.en },
    ...(m.tagline && { description: m.tagline.en }),
    ...(m.availability && { availability: m.availability.en }),
    sameAs,
    knowsAbout: m.skills.map((s) => s.name),
    knowsLanguage: ['en', 'it'],
    pages: Object.fromEntries(m.pages.map((p) => [p.id, p.urls])),
    projects: m.projects.map((p) => ({
      name: p.name,
      ...(p.repo && { repository: p.repo }),
      ...(p.description && { description: p.description }),
      ...(p.language && { language: p.language }),
      ...(p.method && { method: p.method }),
      ...(p.status && { status: p.status }),
    })),
    primaryLanguage: 'en',
  };
  return `${JSON.stringify(profile, null, 2)}\n`;
}
