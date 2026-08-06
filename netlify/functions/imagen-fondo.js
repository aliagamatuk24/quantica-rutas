// Guarda y sirve las imagenes de fondo personalizadas de cada oficina (manager con
// esOficina=true). Se guardan aparte del store principal de datos, para no hacer pesado
// el archivo que se lee cada vez que alguien abre la app.
//  - GET  ?manager=<id>  -> devuelve la imagen guardada para esa oficina (o 404 si no hay).
//  - POST ?manager=<id>  -> guarda/reemplaza la imagen. Body: { base64, contentType }.
//  - DELETE ?manager=<id> -> quita la imagen personalizada de esa oficina.
import { getStore } from '@netlify/blobs';

export default async (req) => {
    try {
        const store = getStore('quantica-rutas-fondos', { consistency: 'strong' });
        const url = new URL(req.url);
        const managerId = url.searchParams.get('manager');
        if (!managerId) {
            return new Response('Falta el parametro manager', { status: 400 });
        }

        if (req.method === 'GET') {
            const resultado = await store.getWithMetadata(managerId, { type: 'arrayBuffer' });
            if (!resultado || !resultado.data) {
                return new Response('No hay imagen de fondo para esta oficina', { status: 404 });
            }
            const contentType = (resultado.metadata && resultado.metadata.contentType) || 'image/jpeg';
            return new Response(resultado.data, {
                headers: {
                    'Content-Type': contentType,
                    // La URL ya trae un "&v=" que cambia cada vez que se sube una imagen nueva,
                    // asi que es seguro dejar que el navegador la guarde en cache un buen rato.
                    'Cache-Control': 'public, max-age=604800, immutable'
                }
            });
        }

        if (req.method === 'POST') {
            const body = await req.json();
            if (!body.base64) {
                return new Response(JSON.stringify({ error: 'Falta la imagen' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            const binario = Uint8Array.from(atob(body.base64), c => c.charCodeAt(0));
            await store.set(managerId, binario, { metadata: { contentType: body.contentType || 'image/jpeg' } });
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (req.method === 'DELETE') {
            await store.delete(managerId);
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response('Metodo no permitido', { status: 405 });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};

export const config = { path: '/api/imagen-fondo' };
