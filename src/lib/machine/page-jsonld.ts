import { buildJsonLd, type JsonLdPage } from './jsonld';
import { loadMachineModel } from './model';

/** JSON-LD di una pagina dal modello unico (richiede il contesto Astro per leggere i dati). */
export async function loadJsonLd(page: JsonLdPage) {
  return buildJsonLd(await loadMachineModel(), page);
}
