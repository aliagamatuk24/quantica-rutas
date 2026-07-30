// Guarda y lee TODOS los datos de la app (managers + clientes) usando Netlify Blobs.
// GET  -> devuelve el estado completo guardado, junto con su "etag" (una huella de esa version)
// POST -> reemplaza el estado, pero SOLO si el etag que manda el navegador coincide con el
//         que hay guardado ahora mismo. Si no coincide, alguien mas guardo algo primero:
//         devolvemos 409 (conflicto) en vez de pisar ese cambio en silencio.
import { getStore } from '@netlify/blobs';

export default async (req) => {
    try {
          const store = getStore('quantica-rutas-data');

      if (req.method === 'GET') {
              const resultado = await store.getWithMetadata('estado', { type: 'json' });
              const estado = (resultado && resultado.data) || { managers: [], clientes: [] };
              const etag = resultado ? resultado.etag : null;
              return new Response(JSON.stringify({ ...estado, _etag: etag }), {
                        headers: { 'Content-Type': 'application/json' }
              });
      }

      if (req.method === 'POST') {
              const body = await req.json();
              const etagRecibido = body._etag || null;
              delete body._etag;

            if (etagRecibido) {
                      const resultado = await store.setJSON('estado', body, { onlyIfMatch: etagRecibido });
                      if (!resultado.modified) {
                                  return new Response(JSON.stringify({ ok: false, conflicto: true }), {
                                                status: 409,
                                                headers: { 'Content-Type': 'application/json' }
                                  });
                      }
                      return new Response(JSON.stringify({ ok: true, etag: resultado.etag }), {
                                  headers: { 'Content-Type': 'application/json' }
                      });
            }

            // No mando etag (primer guardado o compatibilidad vieja): guarda sin condicion.
            await store.setJSON('estado', body);
              return new Response(JSON.stringify({ ok: true }), {
                        headers: { 'Content-Type': 'application/json' }
              });
      }

      return new Response('Metodo no permitido', { status: 405 });
    } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' }
          });
    }
};

export const config = { path: '/api/data' };
