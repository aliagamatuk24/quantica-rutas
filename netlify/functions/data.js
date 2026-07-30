// Guarda y lee TODOS los datos de la app (managers + clientes) usando Netlify Blobs.
// GET  -> devuelve el estado completo guardado, junto con su "etag" (una huella de esa version)
// POST -> reemplaza el estado, pero SOLO si el etag que manda el navegador coincide con el
//         que hay guardado ahora mismo. Si no coincide, alguien mas guardo algo primero:
//         devolvemos 409 (conflicto) en vez de pisar ese cambio en silencio.
//
// Nota tecnica: no usamos la opcion "onlyIfMatch" de Netlify Blobs porque en este proyecto
// no devuelve el resultado esperado (da error 500). En su lugar comparamos el etag nosotros
// mismos: leemos el estado actual justo antes de guardar y solo escribimos si coincide.
import { getStore } from '@netlify/blobs';

export default async (req) => {
      try {
              const store = getStore('quantica-rutas-data', { consistency: 'strong' });

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
                            const actual = await store.getWithMetadata('estado', { type: 'json' });
                            const etagActual = actual ? actual.etag : null;
                            if (etagActual !== etagRecibido) {
                                          return new Response(JSON.stringify({ ok: false, conflicto: true }), {
                                                          status: 409,
                                                          headers: { 'Content-Type': 'application/json' }
                                          });
                            }
                }

                await store.setJSON('estado', body);
                  const nuevo = await store.getWithMetadata('estado', { type: 'json' });
                  const nuevoEtag = nuevo ? nuevo.etag : null;
                  return new Response(JSON.stringify({ ok: true, etag: nuevoEtag }), {
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
