import type { APIRoute } from 'astro';
import { renderMachineFiles } from '../lib/machine/files';

export const GET: APIRoute = async () =>
  new Response((await renderMachineFiles())['profile.json'], {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
