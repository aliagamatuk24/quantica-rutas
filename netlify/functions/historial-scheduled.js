// Cada dia (una vez), guarda una "foto" del avance de cada manager: cuantos clientes
// tenia asignados, cuantos ya gestiono y su % de avance en ese momento. Con estas fotos
// guardadas dia tras dia se puede armar mas adelante una curva de progreso en el tiempo
// (metrica "Curva de avance en el tiempo" del tablero interactivo).
//
// Importante: esto arranca a guardar HOY. Los dias anteriores a hoy no se pueden
// reconstruir porque nunca se guardo esa foto — no hay forma de "inventar" el pasado,
// asi que la curva se va a ir llenando de a poco, dia por dia, desde ahora.
import { getStore } from '@netlify/blobs';

const DIAS_A_GUARDAR = 180; // ~6 meses de historial antes de empezar a borrar lo mas viejo

// Misma cuenta que usa la app (contarGestion en app.js): "gestionado" es cualquier
// cliente que ya se toco (activo, no_atendio, cita o retirado), "por gestionar" es el
// que todavia nadie reviso.
function contarGestion(clientes) {
    const total = clientes.length;
    const porGestionar = clientes.filter(c => c.estatus === 'pendiente').length;
    const gestionados = total - porGestionar;
    return { total, porGestionar, gestionados };
}

export default async () => {
    try {
        const storeDatos = getStore('quantica-rutas-data', { consistency: 'strong' });
        const storeHistorial = getStore('quantica-rutas-historial', { consistency: 'strong' });

        const resultado = await storeDatos.getWithMetadata('estado', { type: 'json' });
        const estado = (resultado && resultado.data) || null;
        if (!estado) {
            return new Response('Sin datos todavia, no hay nada que guardar.', { status: 200 });
        }

        const managers = estado.managers || [];
        const clientes = estado.clientes || [];
        const hoy = new Date().toISOString().slice(0, 10); // "2026-08-08"

        const snapshots = managers.map(m => {
            const clientesM = clientes.filter(c => c.managerId === m.id);
            const { total, gestionados, porGestionar } = contarGestion(clientesM);
            const avance = total > 0 ? Math.round((gestionados / total) * 100) : 0;
            return { managerId: m.id, nombre: m.nombre, total, gestionados, porGestionar, avance };
        });

        // Un solo registro por dia (si la funcion corriera dos veces el mismo dia por
        // cualquier motivo, simplemente se sobreescribe con la foto mas reciente de hoy,
        // no se duplica).
        await storeHistorial.setJSON(hoy, { fecha: hoy, snapshots, _guardadoEn: new Date().toISOString() });

        // Limpieza de historial viejo (mas de DIAS_A_GUARDAR dias)
        const limite = new Date(Date.now() - DIAS_A_GUARDAR * 24 * 60 * 60 * 1000);
        const { blobs } = await storeHistorial.list();
        for (const b of blobs) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(b.key)) continue;
            if (new Date(b.key + 'T00:00:00Z') < limite) await storeHistorial.delete(b.key);
        }

        return new Response(`Historial guardado: ${hoy} (${snapshots.length} managers)`, { status: 200 });
    } catch (err) {
        return new Response('Error al guardar historial: ' + err.message, { status: 500 });
    }
};

export const config = { schedule: '@daily' };
