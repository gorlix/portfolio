import type { APIRoute } from 'astro';
import { loadMachineModel } from '../lib/machine/model';
import { renderAgentMd } from '../lib/machine/render';

export const GET: APIRoute = async () =>
  new Response(renderAgentMd(await loadMachineModel()), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
