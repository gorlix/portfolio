import { createHash } from 'node:crypto';
import { agentFileIds } from '../schemas/agent';
import { loadMachineModel } from './model';
import { renderAgentMd, renderLlmsTxt, renderProfileJson } from './render';
import { renderRobotsTxt } from './robots';
import { renderSitemapXml } from './sitemap';

/**
 * File per macchine generati dal modello unico. Usati sia dagli endpoint nella root sia dalla
 * vetrina `/agent`: stesso codice, quindi contenuto identico byte per byte.
 */
export const machineFileNames = ['llms.txt', 'profile.json', 'agent.md'] as const;
export type MachineFileName = (typeof machineFileNames)[number];

export async function renderMachineFiles(): Promise<Record<MachineFileName, string>> {
  const model = await loadMachineModel();
  return {
    'llms.txt': renderLlmsTxt(model),
    'profile.json': renderProfileJson(model),
    'agent.md': renderAgentMd(model),
  };
}

export interface MachineFileInfo {
  name: (typeof agentFileIds)[number];
  bytes: number;
  /** Prime 8 cifre esadecimali dello SHA-256 del contenuto servito. */
  sha256: string;
}

/** Peso e impronta dei cinque file nella root, calcolati sul contenuto reale generato alla build. */
export async function describeMachineFiles(
  rendered: Record<MachineFileName, string>,
): Promise<MachineFileInfo[]> {
  const contents: Record<(typeof agentFileIds)[number], string> = {
    ...rendered,
    'robots.txt': renderRobotsTxt(),
    'sitemap.xml': renderSitemapXml(),
  };
  return agentFileIds.map((name) => ({
    name,
    bytes: Buffer.byteLength(contents[name], 'utf8'),
    sha256: createHash('sha256').update(contents[name]).digest('hex').slice(0, 8),
  }));
}
