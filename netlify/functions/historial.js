// Deja que la app lea las "fotos" diarias guardadas por historial-scheduled.js, para
// dibujar la curva de avance en el tiempo en el tablero interactivo. Se usa como
// GET /api/historial (devuelve todos los dias guardados, ordenados del mas viejo al
// mas nuevo). El filtrado por manager/oficina se hace en el navegador, ya que el
// historial completo es un archivo chico (unos pocos KB por dia).
import { getStore } from '@netlify/blobs';

export default async () => {
    try {
        const storeHistorial = getStore('quantica-rutas-historial', { consistency: 'strong' });
        const { blobs } = await storeHistorial.list();
        const dias = [];
        for (const b of blobs) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(b.key)) continue;
            const data = await storeHistorial.get(b.key, { type: 'json' });
            if (data) dias.push(data);
        }
        dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
        return new Response(JSON.stringify({ dias }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = { path: '/api/historial' };
