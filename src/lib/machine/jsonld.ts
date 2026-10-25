import { absoluteUrl, localizedPath } from '../i18n';
import type { Locale } from '../schemas/common';
import type { MachineModel } from './model';

/*
 * JSON-LD schema.org per le pagine HTML (home, recruiter, agent). Funzione pura sul modello
 * unico: stessi dati dei file per macchine, nessun dato non approvato (i `todo` sono omessi),
 * lingua della pagina per i testi traducibili.
 */

export type JsonLdPageType = 'WebPage' | 'ProfilePage';

export interface JsonLdPage {
  locale: Locale;
  /** Percorso senza prefisso lingua (es. `/recruiter`). */
  path: string;
  /** Titolo della pagina (lo stesso del `<title>`). */
  name: string;
  type: JsonLdPageType;
}

const personId = (m: MachineModel) => `${new URL(m.pages[0]?.urls.en ?? '/').origin}/#person`;

export function buildJsonLd(m: MachineModel, page: JsonLdPage): Record<string, unknown> {
  const { locale } = page;
  const id = personId(m);
  const sameAs = [m.links.github, m.links.linkedin, m.links.devto, m.links.x].filter(Boolean);
  const credentials = m.certifications.map((c) => ({
    '@type': 'EducationalOccupationalCredential',
    name: c.name,
    ...(c.issuer && { recognizedBy: { '@type': 'Organization', name: c.issuer } }),
    ...(c.date && { dateCreated: c.date }),
    ...(c.verifyUrl && { url: c.verifyUrl }),
  }));

  const person = {
    '@type': 'Person',
    '@id': id,
    name: m.name,
    url: absoluteUrl(localizedPath('/', locale)),
    email: m.email,
    ...(m.role && { jobTitle: m.role[locale] }),
    homeLocation: { '@type': 'Place', name: m.location[locale] },
    ...(m.tagline && { description: m.tagline[locale] }),
    sameAs,
    knowsAbout: m.skills.map((s) => s.name),
    knowsLanguage: ['it', 'en'],
    ...(credentials.length && { hasCredential: credentials }),
  };

  const projects = m.projects.map((p) => ({
    '@type': 'SoftwareSourceCode',
    name: p.name,
    codeRepository: p.repo,
    ...(p.description && { description: p.description[locale] }),
    ...(p.language && { programmingLanguage: p.language }),
    author: { '@id': id },
  }));

  const url = absoluteUrl(localizedPath(page.path, locale));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': page.type,
        '@id': `${url}#page`,
        url,
        name: page.name,
        inLanguage: locale,
        mainEntity: { '@id': id },
      },
      person,
      ...projects,
    ],
  };
}

/** Serializzazione sicura dentro `<script type="application/ld+json">` (niente `</script>` o `<!--`). */
export const serializeJsonLd = (data: unknown): string =>
  JSON.stringify(data).replace(/</g, '\\u003c');
