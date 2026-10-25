import type { APIRoute } from 'astro';
import { loadMachineModel } from '../lib/machine/model';
import { renderProfileJson } from '../lib/machine/render';

export const GET: APIRoute = async () =>
  new Response(renderProfileJson(await loadMachineModel()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
