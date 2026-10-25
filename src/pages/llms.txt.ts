import type { APIRoute } from 'astro';
import { renderMachineFiles } from '../lib/machine/files';

export const GET: APIRoute = async () =>
  new Response((await renderMachineFiles())['llms.txt'], {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
