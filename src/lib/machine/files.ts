import { loadMachineModel } from './model';
import { renderAgentMd, renderLlmsTxt, renderProfileJson } from './render';

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
