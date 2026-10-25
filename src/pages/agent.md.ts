import type { APIRoute } from 'astro';
import { renderMachineFiles } from '../lib/machine/files';

export const GET: APIRoute = async () =>
  new Response((await renderMachineFiles())['agent.md'], {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
