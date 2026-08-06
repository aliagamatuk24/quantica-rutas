// Deja que el panel de administrador vea la lista de respaldos automaticos (GET) y
// restaure uno de ellos si algo se borro por error (POST). Solo se usa desde la
// pantalla "Ver respaldos" del admin.
import { getStore } from '@netlify/blobs';

export default async (req) => {
    try {
        const storeBackups = getStore('quantica-rutas-backups', { consistency: 'strong' });
        const storeDatos = getStore('quantica-rutas-data', { consistency: 'strong' });

        if (req.method === 'GET') {
            const { blobs } = await storeBackups.list();
            const lista = [];
            for (const b of blobs) {
                const meta = await storeBackups.getWithMetadata(b.key, { type: 'json' });
                if (meta && meta.data) {
                    lista.push({
                        clave: b.key,
                        respaldadoEn: meta.data._respaldadoEn || null,
                        totalManagers: (meta.data.managers || []).length,
                        totalClientes: (meta.data.clientes || []).length
                    });
                }
            }
            lista.sort((a, b) => b.clave.localeCompare(a.clave));
            return new Response(JSON.stringify({ respaldos: lista }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (req.method === 'POST') {
            const body = await req.json();
            const clave = body.clave;
            if (!clave) {
                return new Response(JSON.stringify({ error: 'Falta indicar que respaldo restaurar.' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            const respaldo = await storeBackups.get(clave, { type: 'json' });
            if (!respaldo) {
                return new Response(JSON.stringify({ error: 'Ese respaldo ya no existe.' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Antes de reemplazar los datos actuales, guardamos una copia extra de como
            // estaban justo antes de este restaurar, por si el restaurar fue un error.
            const actual = await storeDatos.getWithMetadata('estado', { type: 'json' });
            if (actual && actual.data) {
                const ahora = new Date();
                const claveExtra = 'antes-de-restaurar-' + ahora.toISOString().slice(0, 19).replace(/[:T]/g, '-');
                await storeBackups.setJSON(claveExtra, {
                    managers: actual.data.managers || [],
                    clientes: actual.data.clientes || [],
                    _respaldadoEn: ahora.toISOString()
                });
            }

            await storeDatos.setJSON('estado', {
                managers: respaldo.managers || [],
                clientes: respaldo.clientes || []
            });

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

export const config = { path: '/api/backups' };
