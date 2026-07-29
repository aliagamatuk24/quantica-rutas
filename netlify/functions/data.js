// Guarda y lee TODOS los datos de la app (managers + clientes) usando Netlify Blobs.
// GET  -> devuelve el estado completo guardado
// POST -> reemplaza el estado completo con lo que mande el navegador
import { getStore } from '@netlify/blobs';

export default async (req) => {
  try {
    const store = getStore('quantica-rutas-data');

    if (req.method === 'GET') {
      const estado = await store.get('estado', { type: 'json' });
      return new Response(JSON.stringify(estado || { managers: [], clientes: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST') {
      const nuevoEstado = await req.json();
      await store.setJSON('estado', nuevoEstado);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Método no permitido', { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/data' };
