// Cada hora, hace una copia completa de los datos guardados (managers + clientes) y la
// deja en otro "cajon" (store) totalmente separado del que usan los managers para
// trabajar todos los dias. Asi, si alguien borra algo por error, siempre hay una copia
// de como estaban los datos hace 1 hora (o menos) para poder recuperarlos.
//
// Importante: esta funcion nunca toca el store "quantica-rutas-data" (el que usa la app
// para guardar en vivo). Solo LO LEE y escribe la copia en "quantica-rutas-backups". Por
// eso no puede retrasar ni interferir con el guardado normal de los managers: corre sola,
// una vez por hora, sin que nadie tenga que abrir la app para que funcione.
import { getStore } from '@netlify/blobs';

const DIAS_A_GUARDAR = 30; // despues de este tiempo, se borran los respaldos mas viejos
                            // automaticamente para no acumular espacio para siempre

export default async () => {
    try {
        const storeDatos = getStore('quantica-rutas-data', { consistency: 'strong' });
        const storeBackups = getStore('quantica-rutas-backups', { consistency: 'strong' });

        const resultado = await storeDatos.getWithMetadata('estado', { type: 'json' });
        const estado = (resultado && resultado.data) || null;
        if (!estado) {
            return new Response('Sin datos que respaldar todavia.', { status: 200 });
        }

        const ahora = new Date();
        // Clave con forma "2026-08-06-16" (ano-mes-dia-hora), para que se ordenen solas
        // de mas antigua a mas reciente si se leen alfabeticamente.
        const clave = ahora.toISOString().slice(0, 13).replace('T', '-');
        await storeBackups.setJSON(clave, {
            managers: estado.managers || [],
            clientes: estado.clientes || [],
            _respaldadoEn: ahora.toISOString()
        });

        // Limpieza de respaldos viejos (mas de DIAS_A_GUARDAR dias)
        const limite = new Date(ahora.getTime() - DIAS_A_GUARDAR * 24 * 60 * 60 * 1000);
        const { blobs } = await storeBackups.list();
        for (const b of blobs) {
            const m = b.key.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/);
            if (!m) continue; // no borramos respaldos "antes-de-restaurar-..." automaticamente
            const fechaClave = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]));
            if (fechaClave < limite) await storeBackups.delete(b.key);
        }

        return new Response(`Respaldo guardado: ${clave}`, { status: 200 });
    } catch (err) {
        return new Response('Error al respaldar: ' + err.message, { status: 500 });
    }
};

export const config = { schedule: '@hourly' };
