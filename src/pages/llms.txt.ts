import type { APIRoute } from 'astro';
import { loadMachineModel } from '../lib/machine/model';
import { renderLlmsTxt } from '../lib/machine/render';

export const GET: APIRoute = async () =>
  new Response(renderLlmsTxt(await loadMachineModel()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
