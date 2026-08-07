// ============================================================
// QUÁNTICA RUTAS — Fase 1
// ============================================================

const CLAVE_ADMIN = "quantica2026"; // Cámbiala luego desde el código si quieres otra clave
const API = "/api/data";
const PAIS_GEOCODIFICACION = "us"; // Restringe la busqueda de direcciones a Estados Unidos

let estado = { managers: [], clientes: [] };
let managerActivoId = null;   // manager que está usando la app ahora mismo
let indiceClienteActual = 0;  // posición dentro de la ruta ordenada del manager
let rutaOrdenada = [];        // lista de clientes del manager, ya en orden de visita
let mapaLeaflet = null;
let managerReporteId = null; // manager que se esta viendo en la pantalla "Mi reporte"
let origenReporte = 'saludo'; // de donde se abrio el reporte: 'saludo' o 'admin'

// Managers que tienen ahora mismo una operacion de guardado en curso (borrar cartera,
// cargar cartera nueva o eliminar el manager). Mientras un manager esta aqui, se le
// deshabilitan esos botones en pantalla para que no se puedan lanzar dos operaciones
// al mismo tiempo sobre el mismo manager (eso es lo que causaba que una cartera borrada
// "resucitara" al cargar una lista nueva justo despues).
let managersBloqueados = new Set();

function refrescarPantallasManagers() {
    if (document.getElementById('pantallaAdmin').classList.contains('activa')) renderPanelAdmin();
    if (oficinaActivaId && document.getElementById('pantallaEquipo').classList.contains('activa')) verEquipo(oficinaActivaId, origenEquipo);
}

function bloquearManager(managerId) {
    managersBloqueados.add(managerId);
    refrescarPantallasManagers();
}

function desbloquearManager(managerId) {
    managersBloqueados.delete(managerId);
    refrescarPantallasManagers();
}

// ---------- Utilidades ----------
function uid() { return Math.random().toString(36).slice(2, 10); }

function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function horaAhora() {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaHora(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } function formatearSoloFecha(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); } function formatearSoloHora(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }

function mostrarPantalla(id) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
    document.getElementById(id).classList.add('activa');
}

function mostrarModal(id) { document.getElementById(id).classList.add('activo'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('activo'); }

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ---------- Guardar / cargar datos del servidor ----------
// Usamos un "etag" (huella de version) para que dos celulares guardando casi al mismo
// tiempo no se borren los cambios uno al otro. Antes de guardar siempre volvemos a
// traer lo mas reciente del servidor.
let estadoEtag = null;

async function cargarEstado() {
    try {
          const r = await fetch(API, { cache: 'no-store' });
          const data = await r.json();
          estadoEtag = data._etag || null;
          delete data._etag;
          estado = data;
    } catch (e) {
          console.error("No se pudo cargar el estado", e);
          estado = { managers: [], clientes: [] };
    }
}

async function guardarEstado() {
    try {
          const body = Object.assign({}, estado, { _etag: estadoEtag });
          const r = await fetch(API, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
          if (r.status === 409) return false;
        if (!r.ok) { console.error("El servidor respondio con error al guardar", r.status); return false; }
          const data = await r.json();
          if (data.etag) estadoEtag = data.etag;
          return true;
    } catch (e) {
          console.error("No se pudo guardar", e);
          return false;
    }
}

// Aplica un cambio chiquito sobre los datos MAS RECIENTES del servidor y lo guarda.
// Si otro celular o pantalla guardo algo justo antes, vuelve a traer lo nuevo y
// reintenta el mismo cambio en vez de pisar lo que guardo el otro.
async function actualizarEstado(cambiarFn, intentos) {
    const maxIntentos = intentos || 6;
    for (let i = 0; i < maxIntentos; i++) {
          await cargarEstado();
          await cambiarFn(estado);
          const ok = await guardarEstado();
          if (ok) {
                await esperar(900);
                try {
                      const verif = await fetch(API, { cache: 'no-store' });
                      const verifData = await verif.json();
                      if (verifData._etag === estadoEtag) return true;
                } catch (e) { console.error('No se pudo verificar el guardado', e); }
          }
          await esperar(300 + i * 200);
    }
    return false;
}

// ============================================================
// ARRANQUE
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
    await cargarEstado();
    const params = new URLSearchParams(window.location.search);
    const managerId = params.get('manager');

                          if (managerId) {
                                const m = estado.managers.find(x => x.id === managerId);
                                if (m) {
                                        if (m.activo === false) {
                                                mostrarPantalla('pantallaCuentaDesactivada');
                                                return;
                                        }
                                        managerActivoId = managerId;
                                        prepararSaludo(m);
                                        mostrarPantalla('pantallaSaludo');
                                        return;
                                }
                          }
    mostrarPantalla('pantallaSelector');
});

function cerrarSesion() {
    managerActivoId = null;
    mostrarPantalla('pantallaSelector');
}

// ============================================================
// LOGIN ADMIN
// ============================================================
function mostrarLoginAdmin() { mostrarPantalla('pantallaLoginAdmin'); }

function validarAdmin() {
    const clave = document.getElementById('claveAdmin').value;
    if (clave === CLAVE_ADMIN) {
          document.getElementById('errorAdmin').textContent = '';
          renderPanelAdmin();
          mostrarPantalla('pantallaAdmin');
    } else {
          document.getElementById('errorAdmin').textContent = 'Clave incorrecta, intenta de nuevo.';
    }
}

// ============================================================
// PANEL ADMIN
// ============================================================
function renderPanelAdmin() {
        const cont = document.getElementById('listaManagers');
        if (estado.managers.length === 0) {
                    cont.innerHTML = `<div class="vacio"><div class="vacio-emoji">🧑‍💼</div>Todavía no tienes managers. Crea el primero arriba.</div>`;
                    return;
        }
        cont.innerHTML = estado.managers.map(m => {
                    const clientesM = estado.clientes.filter(c => c.managerId === m.id);
                    const { gestionados, porGestionar, citas, retirados } = contarGestion(clientesM);
                    const link = `${window.location.origin}${window.location.pathname}?manager=${m.id}`;
                    const supervisorTxt = m.supervisorId ? ` - Supervisor: ${(estado.managers.find(x => x.id === m.supervisorId) || {}).nombre || '—'}` : '';
                    const opcionesOficinas = estado.managers.filter(x => x.esOficina && x.id !== m.id).map(o => `<option value="${o.id}" ${m.supervisorId === o.id ? 'selected' : ''}>${o.nombre}</option>`).join('');
                    const bloqueado = managersBloqueados.has(m.id);
                    const acciones = bloqueado
                        ? `<span class="fila-manager-meta" style="font-style:italic;">Procesando, un momento…</span>`
                        : `<button class="chip-link" onclick="copiarLink('${link}')">Copiar link</button><button class="btn-chico btn-violeta" onclick="verMiReporte('${m.id}', 'admin')">Reporte</button><button class="btn-chico btn-teal" onclick="abrirModalCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">+ Cartera</button>${m.esOficina ? `<button class="btn-chico btn-violeta" onclick="verEquipo('${m.id}', 'admin')">Ver equipo</button>` : ''}${m.esOficina ? `<button class="btn-chico btn-ambar" onclick="abrirModalFondo('${m.id}', '${m.nombre.replace(/'/g,"")}')">🖼️ Fondo</button>` : ''}${m.esOficina ? `<button class="btn-chico btn-ambar" onclick="abrirModalFondoVideo('${m.id}', '${m.nombre.replace(/'/g,"")}')">🎬 Video</button>` : ''}${m.esOficina ? `<button class="btn-chico btn-ambar" onclick="abrirModalFondoAudio('${m.id}', '${m.nombre.replace(/'/g,"")}')">🔊 Audio</button>` : ''}<button class="btn-chico btn-ambar" onclick="toggleGrafico3D(this, 'grafico3d-admin-${m.id}', '${m.id}', 'individual')">📊 Ver estadísticas 3D</button><button class="btn-chico ${m.activo === false ? 'btn-verde' : 'btn-rojo'}" onclick="toggleActivo('${m.id}', ${m.activo === false ? 'true' : 'false'})">${m.activo === false ? 'Activar' : 'Desactivar'}</button><button class="btn-chico btn-vaciar" onclick="vaciarCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">Borrar</button><button class="btn-chico btn-vaciar" onclick="eliminarManager('${m.id}', '${m.nombre.replace(/'/g,"")}')">Eliminar</button>`;
                    return `<div class="fila-manager"><div class="dona" style="${donaEstilo(clientesM)}" title="${porGestionar} por gestionar, ${gestionados} gestionados, ${citas} citas, ${retirados} retirados"></div><div class="fila-manager-info"><span class="fila-manager-nombre">${m.nombre}${m.esOficina ? ' <span class="chip-link" style="cursor:default;">Oficina</span>' : ''}${m.activo === false ? ' <span class="chip-link" style="cursor:default;background:#FEE2E2;color:#7A1F1F;">Desactivado</span>' : ''}${semaforoHTML(m, clientesM, 'semaforo-admin-' + m.id)}</span><span class="fila-manager-meta">${gestionados} gestionados - ${porGestionar} por gestionar - ${citas} citas - ${retirados} retirados${supervisorTxt}</span><span class="fila-manager-meta" style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap;"><label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" ${m.esOficina ? 'checked' : ''} onchange="toggleEsOficina('${m.id}', this.checked)" ${bloqueado ? 'disabled' : ''}> Es oficina</label><select style="font-size:12px;padding:2px 4px;border-radius:6px;" onchange="asignarSupervisor('${m.id}', this.value)" ${bloqueado ? 'disabled' : ''}><option value="">Sin supervisor</option>${opcionesOficinas}</select>${selectorVencimientoHTML(m.id, m.fechaVencimiento, bloqueado)}</span></div><div class="fila-manager-acciones">${acciones}</div></div><div id="semaforo-admin-${m.id}"></div><div id="grafico3d-admin-${m.id}"></div>`;
        }).join('');
}

// ============================================================
// RESPALDOS AUTOMATICOS
// ============================================================
// Cada hora, un robot (funcion programada en el servidor) guarda una copia completa de
// todos los managers y clientes. Aqui solo mostramos esa lista y permitimos restaurar
// una copia si algo se borro por error. Ver netlify/functions/backup-scheduled.js y
// netlify/functions/backups.js para el detalle de como se guardan.
async function verRespaldos() {
        const cont = document.getElementById('listaRespaldos');
        cont.innerHTML = `<p class="texto-suave">Cargando respaldos...</p>`;
        mostrarModal('modalRespaldos');
        try {
                const r = await fetch('/api/backups', { cache: 'no-store' });
                const data = await r.json();
                const respaldos = data.respaldos || [];
                if (respaldos.length === 0) {
                        cont.innerHTML = `<div class="vacio"><div class="vacio-emoji">🕐</div>Todavia no hay respaldos guardados. El primero se hace dentro de la primera hora despues de activar esta funcion.</div>`;
                        return;
                }
                cont.innerHTML = respaldos.map(rp => {
                        const fecha = rp.respaldadoEn ? formatearFechaHora(rp.respaldadoEn) : rp.clave;
                        const esExtra = rp.clave.startsWith('antes-de-restaurar-');
                        return `<div class="fila-manager"><div class="fila-manager-info"><span class="fila-manager-nombre">${fecha}${esExtra ? ' <span class="chip-link" style="cursor:default;">Automatico antes de un restaurar</span>' : ''}</span><span class="fila-manager-meta">${rp.totalManagers} managers - ${rp.totalClientes} clientes</span></div><div class="fila-manager-acciones"><button class="btn-chico btn-vaciar" onclick="restaurarRespaldo('${rp.clave}', '${fecha.replace(/'/g,"")}')">Restaurar esta copia</button></div></div>`;
                }).join('');
        } catch (e) {
                cont.innerHTML = `<p class="texto-suave">No se pudo cargar la lista de respaldos. Revisa tu conexion e intenta de nuevo.</p>`;
        }
}

async function restaurarRespaldo(clave, fechaTexto) {
        if (!confirm(`¿Seguro que quieres restaurar la copia de "${fechaTexto}"? Esto va a reemplazar TODOS los managers y clientes actuales por como estaban en ese momento. Se guarda un respaldo extra de como estaba todo justo antes, por si acaso.`)) return;
        if (!confirm(`Ultima confirmacion: se van a reemplazar todos los datos actuales por el respaldo de "${fechaTexto}". ¿Continuar?`)) return;
        try {
                const r = await fetch('/api/backups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clave })
                });
                if (!r.ok) { alert('No se pudo restaurar, intenta de nuevo.'); return; }
                alert('Listo, los datos fueron restaurados.');
                cerrarModal('modalRespaldos');
                await cargarEstado();
                renderPanelAdmin();
        } catch (e) {
                alert('No se pudo restaurar, revisa tu conexion e intenta de nuevo.');
        }
}

// Cuenta clientes por lo que de verdad importa: si ya se les dio seguimiento o no.
// "Gestionado" = ya se le marco algo (sigue activa, no atendio, cita o no volver),
// sin importar si el caso sigue abierto. "Por gestionar" = todavia nadie lo ha tocado.
function contarGestion(clientes) {
    const total = clientes.length;
    const porGestionar = clientes.filter(c => c.estatus === 'pendiente').length;
    const enSeguimiento = clientes.filter(c => c.estatus === 'activo' || c.estatus === 'no_atendio').length;
    const citas = clientes.filter(c => c.estatus === 'cita').length;
    const retirados = clientes.filter(c => c.estatus === 'retirado').length;
    const gestionados = total - porGestionar;
    return { total, porGestionar, gestionados, enSeguimiento, citas, retirados };
}

function donaEstilo(clientes) {
    const total = clientes.length;
    if (total === 0) return 'background:#E2E8F0;';
    const { porGestionar, enSeguimiento, citas } = contarGestion(clientes);
    const p1 = (porGestionar / total) * 360;
    const p2 = p1 + (enSeguimiento / total) * 360;
    const p3 = p2 + (citas / total) * 360;
    return `background:conic-gradient(#8A8F98 0deg ${p1}deg, #7C5CFF ${p1}deg ${p2}deg, #FFB020 ${p2}deg ${p3}deg, #EF4444 ${p3}deg 360deg);`;
}

// Fecha de vencimiento: solo dia (sin hora), la ponen a mano el admin o el manager de oficina.
function formatearFechaSimple(fechaYMD) {
    if (!fechaYMD) return '';
    const d = new Date(fechaYMD + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================
// SELECTOR DE FECHA DE VENCIMIENTO (3 selects: dia/mes/anio)
// ============================================================
// Antes usabamos <input type="date">, pero el campo del "año" de ese input nativo
// no confirma bien el valor cuando se escriben los digitos uno por uno (se quedaba
// guardando cosas como "0020" en vez de "2026"). Con 3 selects normales esto no puede
// fallar: el usuario elige de una lista, nunca escribe numeros a mano.
function opcionesDia(seleccionado) {
    let html = '<option value="">Día</option>';
    for (let d = 1; d <= 31; d++) {
        const v = String(d).padStart(2, '0');
        html += `<option value="${v}" ${seleccionado === v ? 'selected' : ''}>${d}</option>`;
    }
    return html;
}
function opcionesMes(seleccionado) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    let html = '<option value="">Mes</option>';
    meses.forEach((nombre, i) => {
        const v = String(i + 1).padStart(2, '0');
        html += `<option value="${v}" ${seleccionado === v ? 'selected' : ''}>${nombre}</option>`;
    });
    return html;
}
function opcionesAnio(seleccionado) {
    const anioActual = new Date().getFullYear();
    let html = '<option value="">Año</option>';
    for (let a = anioActual; a <= anioActual + 6; a++) {
        html += `<option value="${a}" ${String(seleccionado) === String(a) ? 'selected' : ''}>${a}</option>`;
    }
    return html;
}
// Genera los 3 selects para un manager. "deshabilitado" los apaga mientras ese
// manager tiene una operacion en curso (ver managersBloqueados).
function selectorVencimientoHTML(managerId, fechaYMD, deshabilitado) {
    const partes = (fechaYMD || '').split('-'); // "YYYY-MM-DD"
    const anio = partes[0] || '', mes = partes[1] || '', dia = partes[2] || '';
    const dis = deshabilitado ? 'disabled' : '';
    return `<span class="selector-vencimiento" data-manager="${managerId}">Vencimiento:
        <select class="select-mini select-dia" onchange="recalcularVencimiento(this)" ${dis}>${opcionesDia(dia)}</select>
        <select class="select-mini select-mes" onchange="recalcularVencimiento(this)" ${dis}>${opcionesMes(mes)}</select>
        <select class="select-mini select-anio" onchange="recalcularVencimiento(this)" ${dis}>${opcionesAnio(anio)}</select>
    </span>`;
}
// Se dispara cuando el usuario cambia cualquiera de los 3 selects. Solo guarda
// cuando los 3 tienen un valor elegido (o cuando los 3 quedan vacios, para borrar
// la fecha); si esta a medias, espera a que termine de elegir.
function recalcularVencimiento(elCambiado) {
    const contenedor = elCambiado.closest('.selector-vencimiento');
    const managerId = contenedor.getAttribute('data-manager');
    const selects = contenedor.querySelectorAll('select');
    const dia = selects[0].value, mes = selects[1].value, anio = selects[2].value;
    if (dia && mes && anio) {
        actualizarVencimiento(managerId, `${anio}-${mes}-${dia}`);
    } else if (!dia && !mes && !anio) {
        actualizarVencimiento(managerId, '');
    }
}

function diasActivaCartera(clientes) {
        const fechas = clientes.map(c => c.fechaCarga).filter(Boolean);
        if (fechas.length === 0) return 1;
        const minFecha = fechas.reduce((a, b) => (a < b ? a : b));
        const inicio = new Date(minFecha); inicio.setHours(0, 0, 0, 0);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const dias = Math.round((hoy - inicio) / 86400000) + 1;
        return Math.max(1, dias);
}

function clientesPorDia(clientes) {
        const visitados = clientes.filter(c => c.fechaHoraLlegada).length;
        const dias = diasActivaCartera(clientes);
        return dias > 0 ? visitados / dias : 0;
}

// Version "cruda" de fechaEstimadaFin: en vez de devolver el texto ya formateado,
// devuelve el objeto Date (para poder compararlo con la fecha de vencimiento), o el
// texto 'completado' si ya no quedan pendientes, o null si todavia no hay ritmo
// suficiente para estimar (cero visitas hechas todavia).
function fechaEstimadaFinRaw(clientes) {
        const pendientes = clientes.filter(c => !c.fechaHoraLlegada && c.estatus !== 'retirado').length;
        if (pendientes === 0) return 'completado';
        const ritmo = clientesPorDia(clientes);
        if (ritmo <= 0) return null;
        const diasRestantes = Math.ceil(pendientes / ritmo);
        const fecha = new Date();
        fecha.setHours(0, 0, 0, 0);
        fecha.setDate(fecha.getDate() + diasRestantes);
        return fecha;
}

function fechaEstimadaFin(clientes) {
        const raw = fechaEstimadaFinRaw(clientes);
        if (raw === 'completado') return 'Completado';
        if (raw === null) return null;
        return raw.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================
// SEMAFORO DE CUMPLIMIENTO (verde / amarillo / rojo / gris)
// ============================================================
// Compara, para cada manager, cuantas visitas le faltan y a que ritmo esta trabajando
// contra la fecha limite (vencimiento) que le puso el admin. Asi se ve de un vistazo
// quien va bien, quien esta en riesgo y quien va mal, sin tener que leer los numeros.
//  - Gris: el manager no tiene fecha de vencimiento puesta, no se puede medir.
//  - Verde: al ritmo actual, termina a tiempo (o ya termino).
//  - Amarillo: al ritmo actual, terminaria hasta 3 dias despues de la fecha limite.
//  - Rojo: terminaria mas de 3 dias tarde, o la fecha limite ya paso y le quedan clientes.
function calcularSemaforo(manager, clientes) {
        if (!manager.fechaVencimiento) {
                return { color: 'gris', texto: `${manager.nombre} no tiene fecha límite puesta todavía, así que no se puede saber si va bien o mal. Ponle un vencimiento para poder medirlo.` };
        }
        const vencimiento = new Date(manager.fechaVencimiento + 'T00:00:00');
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const pendientes = clientes.filter(c => !c.fechaHoraLlegada && c.estatus !== 'retirado').length;
        const vencimientoTxt = formatearFechaSimple(manager.fechaVencimiento);

        if (pendientes === 0) {
                return { color: 'verde', texto: `${manager.nombre} ya terminó toda su cartera. Fecha límite: ${vencimientoTxt}.` };
        }

        const diasHastaVencimiento = Math.round((vencimiento - hoy) / 86400000);
        const finEstimadoRaw = fechaEstimadaFinRaw(clientes);

        if (finEstimadoRaw === null) {
                // Todavia no ha registrado ninguna visita, no hay ritmo para calcular.
                if (diasHastaVencimiento < 0) {
                        return { color: 'rojo', texto: `${manager.nombre}: la fecha límite (${vencimientoTxt}) ya pasó y todavía tiene ${pendientes} clientes pendientes, sin ninguna visita registrada.` };
                }
                return { color: 'amarillo', texto: `${manager.nombre} todavía no registra visitas. Le quedan ${pendientes} clientes y ${diasHastaVencimiento} día${diasHastaVencimiento === 1 ? '' : 's'} hasta la fecha límite (${vencimientoTxt}).` };
        }

        const finEstimadoTxt = finEstimadoRaw.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        const diasDiferencia = Math.round((finEstimadoRaw - vencimiento) / 86400000); // positivo = terminaria tarde

        if (diasDiferencia <= 0) {
                return { color: 'verde', texto: `${manager.nombre} va bien: al ritmo actual terminaría el ${finEstimadoTxt}, a tiempo para la fecha límite (${vencimientoTxt}). Le quedan ${pendientes} clientes.` };
        }
        if (diasDiferencia <= 3) {
                return { color: 'amarillo', texto: `${manager.nombre} está en riesgo: al ritmo actual terminaría el ${finEstimadoTxt}, ${diasDiferencia} día${diasDiferencia === 1 ? '' : 's'} después de la fecha límite (${vencimientoTxt}). Le quedan ${pendientes} clientes.` };
        }
        return { color: 'rojo', texto: `${manager.nombre} va mal: al ritmo actual terminaría el ${finEstimadoTxt}, ${diasDiferencia} días después de la fecha límite (${vencimientoTxt}). Le quedan ${pendientes} clientes.` };
}

// Dibuja el circulo de color (semaforo) listo para insertar en una fila. Al tocarlo,
// despliega/oculta el detalle en el contenedor indicado (mismo patron que los graficos 3D).
function semaforoHTML(manager, clientes, contenedorId) {
        const { color, texto } = calcularSemaforo(manager, clientes);
        const textoSeguro = texto.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `<span class="semaforo semaforo-${color}" title="${texto.replace(/"/g,'&quot;')}" onclick="toggleSemaforoDetalle(this, '${contenedorId}', '${textoSeguro}')"></span>`;
}

function toggleSemaforoDetalle(el, contenedorId, texto) {
        const cont = document.getElementById(contenedorId);
        if (!cont) return;
        cont.innerHTML = cont.innerHTML ? '' : `<p class="texto-suave" style="margin:6px 0 0;">🚦 ${texto}</p>`;
}

function tasaEfectividad(clientes) {
        const citas = clientes.filter(c => c.estatus === 'cita').length;
        const retirados = clientes.filter(c => c.estatus === 'retirado').length;
        const denom = citas + retirados;
        return denom > 0 ? Math.round((citas / denom) * 100) : null;
}

function subManagersDe(oficinaId) {
        return estado.managers.filter(m => m.supervisorId === oficinaId);
}

async function vaciarCartera(managerId, nombre) {
    const clientesM = estado.clientes.filter(c => c.managerId === managerId);
    if (clientesM.length === 0) { alert('Ese manager ya no tiene clientes cargados.'); return; }
    if (managersBloqueados.has(managerId)) { alert('Ya hay una operacion en curso para este manager, espera a que termine.'); return; }
    if (!confirm(`¿Seguro que quieres borrar los ${clientesM.length} clientes de "${nombre}"? Esto no se puede deshacer.`)) return;
    if (!confirm(`Última confirmación: se van a borrar ${clientesM.length} clientes de "${nombre}" para siempre.`)) return;
    // Bloqueamos este manager (se deshabilitan sus botones en pantalla) mientras se guarda
    // el borrado, para que no se pueda lanzar una carga de cartera nueva al mismo tiempo
    // y choquen los dos guardados (eso era lo que hacia que la cartera borrada reapareciera).
    bloquearManager(managerId);
    const ok = await actualizarEstado((est) => {
          est.clientes = est.clientes.filter(c => c.managerId !== managerId);
    });
    if (!ok) alert('No se pudo borrar, intenta de nuevo.');
    desbloquearManager(managerId);
}

async function eliminarManager(managerId, nombre) {
        const clientesM = estado.clientes.filter(c => c.managerId === managerId);
        if (managersBloqueados.has(managerId)) { alert('Ya hay una operacion en curso para este manager, espera a que termine.'); return; }
        const mensaje = clientesM.length > 0
            ? `Seguro que quieres eliminar a "${nombre}" para siempre? Tambien se borraran sus ${clientesM.length} clientes cargados y el link que le compartiste dejara de funcionar. Esto no se puede deshacer.`
                    : `Seguro que quieres eliminar a "${nombre}" para siempre? El link que le compartiste dejara de funcionar. Esto no se puede deshacer.`;
        if (!confirm(mensaje)) return;
        if (!confirm(`Ultima confirmacion: se va a eliminar al manager "${nombre}" para siempre.`)) return;
        bloquearManager(managerId);
        const ok = await actualizarEstado((est) => {
                    est.managers = est.managers.filter(m => m.id !== managerId);
                    est.clientes = est.clientes.filter(c => c.managerId !== managerId);
        });
        if (!ok) alert('No se pudo eliminar, intenta de nuevo.');
        desbloquearManager(managerId);
}

function copiarLink(link) { navigator.clipboard.writeText(link).then(() => alert(`Link copiado: ${link} - enviaselo a tu manager por WhatsApp.`)).catch(() => prompt('No se pudo copiar automatico. Copia este link a mano:', link)); }

async function crearManager() {
        const nombre = document.getElementById('nombreNuevoManager').value.trim();
        if (!nombre) return;
        const esOficina = document.getElementById('nuevoManagerEsOficina').checked;
        const supervisorId = document.getElementById('nuevoManagerSupervisor').value || null;
        const nuevoId = uid();
        // "if (!existe) push" en vez de "push" a secas: actualizarEstado puede reintentar
        // varias veces si la verificacion posterior al guardado tarda mas de la cuenta
        // (aunque el guardado si haya funcionado). Sin este chequeo, cada reintento
        // agregaba OTRA copia del mismo manager -> aparecian managers duplicados.
        const ok = await actualizarEstado((est) => {
                    if (!est.managers.some(m => m.id === nuevoId)) {
                                est.managers.push({ id: nuevoId, nombre, activo: true, jornadaInicio: null, jornadaFin: null, esOficina, supervisorId });
                    }
        });
        document.getElementById('nombreNuevoManager').value = '';
        document.getElementById('nuevoManagerEsOficina').checked = false;
        cerrarModal('modalNuevoManager');
        if (!ok) alert('No se pudo guardar el nuevo manager, revisa tu conexion e intenta de nuevo.');
        renderPanelAdmin();
}

function abrirModalNuevoManager() {
        const sel = document.getElementById('nuevoManagerSupervisor');
        const opciones = estado.managers.filter(m => m.esOficina).map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
        sel.innerHTML = `<option value="">Sin supervisor</option>${opciones}`;
        document.getElementById('nuevoManagerEsOficina').checked = false;
        mostrarModal('modalNuevoManager');
}

async function toggleEsOficina(managerId, valor) {
        const ok = await actualizarEstado((est) => {
                    const m = est.managers.find(x => x.id === managerId);
                    if (m) m.esOficina = valor;
        });
        if (!ok) alert('No se pudo guardar el cambio, intenta de nuevo.');
        renderPanelAdmin();
}

// Activa o desactiva la cuenta de un manager (de oficina o general) sin borrar sus datos.
// Un manager desactivado no puede entrar a su link ni comenzar su ruta hasta que lo
// reactives; sus clientes y su historial se quedan intactos, solo se bloquea el acceso.
async function toggleActivo(managerId, valor) {
        if (managersBloqueados.has(managerId)) { alert('Ya hay una operacion en curso para este manager, espera a que termine.'); return; }
        const m = estado.managers.find(x => x.id === managerId);
        const nombre = m ? m.nombre : 'este manager';
        if (valor === false && !confirm(`¿Seguro que quieres desactivar a "${nombre}"? No podra entrar a su cuenta hasta que la reactives. Sus clientes y su historial no se borran.`)) return;
        const ok = await actualizarEstado((est) => {
                    const mm = est.managers.find(x => x.id === managerId);
                    if (mm) mm.activo = valor;
        });
        if (!ok) alert('No se pudo guardar el cambio, intenta de nuevo.');
        renderPanelAdmin();
}

async function asignarSupervisor(managerId, supervisorId) {
        const ok = await actualizarEstado((est) => {
                    const m = est.managers.find(x => x.id === managerId);
                    if (m) m.supervisorId = supervisorId || null;
        });
        if (!ok) alert('No se pudo guardar el cambio, intenta de nuevo.');
        renderPanelAdmin();
}

// Fecha limite manual por manager. La puede poner el admin (desde el panel) o un
// manager de oficina (desde "Ver equipo", solo para su propia gente).
async function actualizarVencimiento(managerId, valor) {
        const ok = await actualizarEstado((est) => {
                    const m = est.managers.find(x => x.id === managerId);
                    if (m) m.fechaVencimiento = valor || null;
        });
        if (!ok) alert('No se pudo guardar la fecha de vencimiento, intenta de nuevo.');
        if (oficinaActivaId) {
                    verEquipo(oficinaActivaId, origenEquipo);
        } else {
                    renderPanelAdmin();
        }
}

let oficinaActivaId = null;
let origenEquipo = 'saludo';

function verEquipo(oficinaId, origen) {
        oficinaActivaId = oficinaId;
        origenEquipo = origen || 'saludo';
        const oficina = estado.managers.find(m => m.id === oficinaId);
        if (!oficina) return;
        document.getElementById('equipoNombreOficina').textContent = oficina.nombre;
        const subs = subManagersDe(oficinaId);
        const idsSubs = subs.map(m => m.id);
        const clientesEquipo = estado.clientes.filter(c => idsSubs.includes(c.managerId));

        document.getElementById('equipoDona').setAttribute('style', `width:64px;height:64px;border-radius:50%;flex-shrink:0;${donaEstilo(clientesEquipo)}`);
        const { gestionados: gestionadosEq, porGestionar: porGestionarEq, citas: citasEq, retirados: retiradosEq } = contarGestion(clientesEquipo);
        document.getElementById('equipoResumenTexto').textContent = `${clientesEquipo.length} clientes en total del equipo - ${gestionadosEq} gestionados - ${porGestionarEq} por gestionar - ${citasEq} citas - ${retiradosEq} no volver`;

        const efectividadEq = tasaEfectividad(clientesEquipo);
        const diasEq = diasActivaCartera(clientesEquipo);
        const ritmoEq = clientesPorDia(clientesEquipo);
        const finEq = fechaEstimadaFin(clientesEquipo);
        document.getElementById('equipoStatsTexto').innerHTML = `<b>Tasa de efectividad:</b> ${efectividadEq != null ? efectividadEq + '%' : 'Sin datos aun'} &nbsp;·&nbsp; <b>Dias activa:</b> ${diasEq} &nbsp;·&nbsp; <b>Clientes/dia:</b> ${ritmoEq.toFixed(1)} &nbsp;·&nbsp; <b>Fin estimado:</b> ${finEq || 'Sin datos aun'}`;

        document.getElementById('listaEquipo').innerHTML = subs.length === 0
            ? `<div class="vacio"><div class="vacio-emoji">🧑‍💼</div>Todavia no tienes sub-managers asignados.</div>`
                    : subs.map(m => {
                                    const clientesM = estado.clientes.filter(c => c.managerId === m.id);
                                    const { gestionados, porGestionar, citas, retirados } = contarGestion(clientesM);
                                    const bloqueado = managersBloqueados.has(m.id);
                                    const link = `${window.location.origin}${window.location.pathname}?manager=${m.id}`;
                                    const acciones = bloqueado
                                        ? `<span class="fila-manager-meta" style="font-style:italic;">Procesando, un momento…</span>`
                                        : `<button class="chip-link" onclick="copiarLink('${link}')">Copiar link</button><button class="btn-chico btn-violeta" onclick="verMiReporte('${m.id}', 'equipo')">Reporte</button><button class="btn-chico btn-teal" onclick="abrirModalCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">+ Cartera</button><button class="btn-chico btn-ambar" onclick="toggleGrafico3D(this, 'grafico3d-equipo-${m.id}', '${m.id}', 'individual')">📊 Ver estadísticas 3D</button><button class="btn-chico btn-vaciar" onclick="vaciarCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">Borrar</button>`;
                                    return `<div class="fila-manager"><div class="dona" style="${donaEstilo(clientesM)}" title="${porGestionar} por gestionar, ${gestionados} gestionados, ${citas} citas, ${retirados} retirados"></div><div class="fila-manager-info"><span class="fila-manager-nombre">${m.nombre}${semaforoHTML(m, clientesM, 'semaforo-equipo-' + m.id)}</span><span class="fila-manager-meta">${clientesM.length} clientes - ${gestionados} gestionados - ${porGestionar} por gestionar - ${citas} citas - ${retirados} retirados</span><span class="fila-manager-meta" style="display:block;margin-top:4px;">${selectorVencimientoHTML(m.id, m.fechaVencimiento, bloqueado)}</span></div><div class="fila-manager-acciones">${acciones}</div></div><div id="semaforo-equipo-${m.id}"></div><div id="grafico3d-equipo-${m.id}"></div>`;
                    }).join('');

        mostrarPantalla('pantallaEquipo');
}

function volverDeEquipo() {
        if (origenEquipo === 'admin') {
                    renderPanelAdmin();
                    mostrarPantalla('pantallaAdmin');
        } else {
                    mostrarPantalla('pantallaSaludo');
        }
}

let managerCarteraActual = null;
let cargaCarteraToken = 0;
let cargaCarteraActiva = false;

function abrirModalCartera(managerId, nombre) {
        if (managersBloqueados.has(managerId)) { alert('Ya hay una operacion en curso para este manager, espera a que termine.'); return; }
        managerCarteraActual = managerId;
        document.getElementById('nombreManagerCartera').textContent = nombre;
        document.getElementById('textoCartera').value = '';
        document.getElementById('previewCartera').textContent = '';
        document.getElementById('archivoCarteraExcel').value = '';
        cargaCarteraToken++;
        cargaCarteraActiva = false;
        document.getElementById('btnCargarCartera').style.display = '';
        document.getElementById('btnDetenerCarga').style.display = 'none';
        // Avisamos claramente si este manager ya tiene clientes: cargar una lista nueva
        // SIEMPRE reemplaza la cartera actual completa (no se suma a lo que ya habia).
        const yaTiene = estado.clientes.filter(c => c.managerId === managerId).length;
        const aviso = document.getElementById('avisoCarteraExistente');
        if (aviso) {
                    if (yaTiene > 0) {
                                aviso.style.display = '';
                                aviso.textContent = `⚠️ ${nombre} ya tiene ${yaTiene} cliente${yaTiene === 1 ? '' : 's'} cargado${yaTiene === 1 ? '' : 's'}. Al cargar la lista nueva, esa cartera actual sera REEMPLAZADA por completo (no se suma).`;
                    } else {
                                aviso.style.display = 'none';
                    }
        }
        mostrarModal('modalCartera');
}

function cerrarModalCartera() {
        cargaCarteraToken++;
        cargaCarteraActiva = false;
        cerrarModal('modalCartera');
}

function detenerCargaCartera() {
        cargaCarteraToken++;
        cargaCarteraActiva = false;
        document.getElementById('previewCartera').textContent = 'Carga detenida. No se guardo nada todavia.';
        document.getElementById('btnCargarCartera').style.display = '';
        document.getElementById('btnDetenerCarga').style.display = 'none';
}

// ============================================================
// FONDO PERSONALIZADO POR OFICINA
// ============================================================
// El admin puede subir una imagen de fondo para cada manager de oficina. Esa imagen se
// aplica automaticamente cuando ESE manager, o cualquiera de sus sub-managers, abre su
// propio link (nunca afecta el panel del admin ni a otras oficinas). La imagen se guarda
// en un almacen aparte del store principal (ver netlify/functions/imagen-fondo.js); en el
// manager solo se guarda "fondoVersion" (un numero) para saber si tiene imagen o no, y
// para forzar que el navegador siempre pida la version mas nueva.
let managerFondoActual = null;

function abrirModalFondo(managerId, nombre) {
        managerFondoActual = managerId;
        const m = estado.managers.find(x => x.id === managerId);
        document.getElementById('nombreManagerFondo').textContent = nombre;
        document.getElementById('archivoFondo').value = '';
        const preview = document.getElementById('previewFondo');
        const btnQuitar = document.getElementById('btnQuitarFondo');
        if (m && m.fondoVersion) {
                    preview.innerHTML = `<img src="/api/imagen-fondo?manager=${managerId}&v=${m.fondoVersion}" style="max-width:100%;max-height:160px;border-radius:10px;display:block;margin-top:8px;">`;
                    btnQuitar.style.display = '';
        } else {
                    preview.innerHTML = `<p class="texto-suave" style="margin-top:8px;">Esta oficina todavía no tiene una imagen de fondo personalizada.</p>`;
                    btnQuitar.style.display = 'none';
        }
        mostrarModal('modalFondo');
}

function cerrarModalFondo() {
        cerrarModal('modalFondo');
}

// Convierte el archivo elegido a base64 y lo manda al servidor. La imagen queda asociada
// al id del manager de oficina; luego, cuando ese manager (o alguien de su equipo) abre su
// link, se aplica automaticamente como fondo de su pantalla (ver aplicarFondoPersonalizado).
async function subirFondoOficina() {
        if (!managerFondoActual) return;
        const input = document.getElementById('archivoFondo');
        const archivo = input.files[0];
        if (!archivo) { alert('Elige primero una imagen.'); return; }
        if (archivo.size > 6 * 1024 * 1024) { alert('La imagen es muy pesada (mas de 6MB). Usa una mas liviana.'); return; }

        const btn = document.getElementById('btnGuardarFondo');
        btn.disabled = true;
        btn.textContent = 'Subiendo...';
        try {
                    const base64 = await new Promise((resolve, reject) => {
                                const lector = new FileReader();
                                lector.onload = () => resolve(lector.result.split(',')[1]);
                                lector.onerror = reject;
                                lector.readAsDataURL(archivo);
                    });
                    const r = await fetch(`/api/imagen-fondo?manager=${managerFondoActual}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ base64, contentType: archivo.type || 'image/jpeg' })
                    });
                    if (!r.ok) { alert('No se pudo subir la imagen, intenta de nuevo.'); return; }

                    const managerId = managerFondoActual;
                    const ok = await actualizarEstado((est) => {
                                const mm = est.managers.find(x => x.id === managerId);
                                // Usamos la hora exacta como numero de version (en vez de sumar 1 al valor
                                // anterior) para que sea seguro repetir esta operacion: si actualizarEstado
                                // reintenta por una falsa alarma de verificacion, cada intento vuelve a poner
                                // un numero valido y mas nuevo, en lugar de ir sumando de mas cada vez.
                                if (mm) mm.fondoVersion = Date.now();
                    });
                    if (!ok) { alert('La imagen se subio pero no se pudo guardar la referencia, intenta de nuevo.'); return; }

                    alert('Listo, la imagen de fondo fue guardada.');
                    cerrarModalFondo();
                    refrescarTrasCambioFondo(managerId);
        } catch (e) {
                    alert('No se pudo subir la imagen, revisa tu conexion e intenta de nuevo.');
        } finally {
                    btn.disabled = false;
                    btn.textContent = 'Guardar imagen';
        }
}

async function quitarFondoOficina() {
        if (!managerFondoActual) return;
        if (!confirm('¿Seguro que quieres quitar la imagen de fondo de esta oficina?')) return;
        const managerId = managerFondoActual;
        try {
                    await fetch(`/api/imagen-fondo?manager=${managerId}`, { method: 'DELETE' });
        } catch (e) { /* si falla el borrado del archivo, igual quitamos la referencia abajo */ }
        const ok = await actualizarEstado((est) => {
                    const mm = est.managers.find(x => x.id === managerId);
                    if (mm) mm.fondoVersion = null;
        });
        if (!ok) { alert('No se pudo guardar el cambio, intenta de nuevo.'); return; }
        cerrarModalFondo();
        refrescarTrasCambioFondo(managerId);
}

// ============================================================
// FONDO DE VIDEO POR OFICINA
// ============================================================
// A diferencia de la foto, el video NUNCA pasa por nuestro servidor: aqui solo se guarda
// la direccion web (URL) de un video que el admin (o el propio manager de oficina) ya subio
// a otro lugar (por ejemplo, subido dentro de esta misma app como archivo, o a un servicio
// como Cloudinary). El navegador lo reproduce directo desde esa direccion. Por eso no hay
// limite de tamaño como con las fotos (que si pasan por nuestro servidor y estan limitadas
// a unos pocos MB).
let managerFondoVideoActual = null;

function abrirModalFondoVideo(managerId, nombre) {
        managerFondoVideoActual = managerId;
        const m = estado.managers.find(x => x.id === managerId);
        document.getElementById('nombreManagerFondoVideo').textContent = nombre;
        const input = document.getElementById('urlFondoVideo');
        input.value = (m && m.fondoVideoUrl) || '';
        const btnQuitar = document.getElementById('btnQuitarFondoVideo');
        btnQuitar.style.display = (m && m.fondoVideoUrl) ? '' : 'none';
        mostrarModal('modalFondoVideo');
}

function cerrarModalFondoVideo() {
        cerrarModal('modalFondoVideo');
}

async function guardarFondoVideo() {
        if (!managerFondoVideoActual) return;
        const input = document.getElementById('urlFondoVideo');
        const url = input.value.trim();
        if (!url) { alert('Pega primero el link del video.'); return; }
        try { new URL(url); } catch (e) { alert('Ese link no parece valido. Debe empezar con https://'); return; }

        const managerId = managerFondoVideoActual;
        const btn = document.getElementById('btnGuardarFondoVideo');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        try {
                    const ok = await actualizarEstado((est) => {
                                const mm = est.managers.find(x => x.id === managerId);
                                if (mm) mm.fondoVideoUrl = url;
                    });
                    if (!ok) { alert('No se pudo guardar el cambio, intenta de nuevo.'); return; }
                    alert('Listo, el video de fondo fue guardado.');
                    cerrarModalFondoVideo();
                    refrescarTrasCambioFondo(managerId);
        } finally {
                    btn.disabled = false;
                    btn.textContent = 'Guardar video';
        }
}

async function quitarFondoVideo() {
        if (!managerFondoVideoActual) return;
        if (!confirm('¿Seguro que quieres quitar el video de fondo de esta oficina?')) return;
        const managerId = managerFondoVideoActual;
        const ok = await actualizarEstado((est) => {
                    const mm = est.managers.find(x => x.id === managerId);
                    if (mm) mm.fondoVideoUrl = null;
        });
        if (!ok) { alert('No se pudo guardar el cambio, intenta de nuevo.'); return; }
        cerrarModalFondoVideo();
        refrescarTrasCambioFondo(managerId);
}

// Atajos para que un manager de oficina cambie SU PROPIO fondo (foto o video) desde su
// propia pantalla de saludo, sin necesitar que el administrador lo haga por el.
function abrirModalFondoPropio() {
        const m = estado.managers.find(x => x.id === managerActivoId);
        if (!m) return;
        abrirModalFondo(m.id, m.nombre);
}
function abrirModalFondoVideoPropio() {
        const m = estado.managers.find(x => x.id === managerActivoId);
        if (!m) return;
        abrirModalFondoVideo(m.id, m.nombre);
}
function abrirModalFondoAudioPropio() {
        const m = estado.managers.find(x => x.id === managerActivoId);
        if (!m) return;
        abrirModalFondoAudio(m.id, m.nombre);
}

// ============================================================
// SONIDO DE BIENVENIDA POR OFICINA
// ============================================================
// Igual que el video: solo guardamos la direccion web (URL) de un audio corto (unos 8
// segundos) que el admin (o el propio manager de oficina) ya subio a algun lado. No pasa
// por nuestro servidor, asi que no hay limite de tamaño real.
let managerFondoAudioActual = null;

function abrirModalFondoAudio(managerId, nombre) {
        managerFondoAudioActual = managerId;
        const m = estado.managers.find(x => x.id === managerId);
        document.getElementById('nombreManagerFondoAudio').textContent = nombre;
        const input = document.getElementById('urlFondoAudio');
        input.value = (m && m.fondoAudioUrl) || '';
        const btnQuitar = document.getElementById('btnQuitarFondoAudio');
        btnQuitar.style.display = (m && m.fondoAudioUrl) ? '' : 'none';
        mostrarModal('modalFondoAudio');
}

function cerrarModalFondoAudio() {
        cerrarModal('modalFondoAudio');
}

async function guardarFondoAudio() {
        if (!managerFondoAudioActual) return;
        const input = document.getElementById('urlFondoAudio');
        const url = input.value.trim();
        if (!url) { alert('Pega primero el link del audio.'); return; }
        try { new URL(url); } catch (e) { alert('Ese link no parece valido. Debe empezar con https://'); return; }

        const managerId = managerFondoAudioActual;
        const btn = document.getElementById('btnGuardarFondoAudio');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        try {
                    const ok = await actualizarEstado((est) => {
                                const mm = est.managers.find(x => x.id === managerId);
                                if (mm) mm.fondoAudioUrl = url;
                    });
                    if (!ok) { alert('No se pudo guardar el cambio, intenta de nuevo.'); return; }
                    alert('Listo, el audio de bienvenida fue guardado.');
                    cerrarModalFondoAudio();
                    refrescarTrasCambioFondo(managerId);
        } finally {
                    btn.disabled = false;
                    btn.textContent = 'Guardar audio';
        }
}

async function quitarFondoAudio() {
        if (!managerFondoAudioActual) return;
        if (!confirm('¿Seguro que quieres quitar el audio de bienvenida de esta oficina?')) return;
        const managerId = managerFondoAudioActual;
        const ok = await actualizarEstado((est) => {
                    const mm = est.managers.find(x => x.id === managerId);
                    if (mm) mm.fondoAudioUrl = null;
        });
        if (!ok) { alert('No se pudo guardar el cambio, intenta de nuevo.'); return; }
        cerrarModalFondoAudio();
        refrescarTrasCambioFondo(managerId);
}

// Recuerda para cuales managers ya sonó el audio de bienvenida EN ESTA VISITA (esta pestaña
// abierta), para no repetirlo cada vez que se refresca la pantalla de saludo (por ejemplo
// justo despues de cambiar el fondo desde el mismo boton de "Mi equipo").
const audiosBienvenidaYaSonaron = new Set();
// Managers para los que ya dejamos un "oyente" de clic/toque esperando poder reproducir el
// audio: evita duplicar el audio y los oyentes si prepararSaludo() se llama varias veces
// (por ejemplo, si el manager cambia su fondo mientras sigue en la misma pantalla).
const audiosBienvenidaEnProgreso = new Set();

// Intenta reproducir el audio de bienvenida de la oficina del manager (si tiene uno
// configurado). Los navegadores bloquean por seguridad el sonido automatico si la persona
// no interactuo antes con la pagina, asi que si el intento automatico falla, dejamos un
// "oyente" invisible (sin ningun boton) que reintenta reproducir el audio en CADA toque o
// clic en cualquier parte de la pantalla, hasta que uno de esos intentos funcione de verdad
// (antes solo se intentaba una vez con el primer toque, y si ese primer intento tambien
// fallaba por cualquier motivo, ya no se volvia a intentar).
function reproducirAudioBienvenida(manager) {
        const oficina = oficinaDe(manager);
        if (!oficina || !oficina.fondoAudioUrl) return;
        if (audiosBienvenidaYaSonaron.has(manager.id)) return;
        if (audiosBienvenidaEnProgreso.has(manager.id)) return;
        audiosBienvenidaEnProgreso.add(manager.id);

        const audio = new Audio(oficina.fondoAudioUrl);
        // Confirmamos que el audio esta sonando de verdad (no solo que se llamo play(), que
        // puede quedar pendiente o fallar en silencio) antes de cortarlo a los 8 segundos y
        // de marcarlo como "ya sono", para no bloquear reintentos por error.
        let seEstaReproduciendo = false;
        audio.addEventListener('playing', () => {
                    if (seEstaReproduciendo) return;
                    seEstaReproduciendo = true;
                    audiosBienvenidaYaSonaron.add(manager.id);
                    audiosBienvenidaEnProgreso.delete(manager.id);
                    document.removeEventListener('click', intentarConGesto);
                    document.removeEventListener('touchstart', intentarConGesto);
                    document.removeEventListener('keydown', intentarConGesto);
                    // Por si el archivo subido no dura los ~8 segundos esperados, lo cortamos
                    // igual a los 8 segundos para evitar un sonido de fondo interminable.
                    setTimeout(() => { audio.pause(); }, 8000);
        });

        const intentarConGesto = () => { audio.play().catch(() => {}); };

        // Primer intento automatico, sin esperar ningun toque (funciona en algunos casos,
        // por ejemplo en computadoras donde ya se navego antes por el sitio).
        audio.play().catch(() => {});

        // Y si eso fue bloqueado, reintentamos en cada toque/clic/tecla siguiente, las veces
        // que haga falta, hasta que uno de esos intentos si logre sonar.
        document.addEventListener('click', intentarConGesto);
        document.addEventListener('touchstart', intentarConGesto);
        document.addEventListener('keydown', intentarConGesto);
}

// Encuentra la "oficina" (manager con esOficina=true) a la que pertenece un manager: el
// mismo si el es la oficina, o su supervisor si es un sub-manager. Sirve para saber de
// donde sacar el fondo personalizado a aplicar.
function oficinaDe(manager) {
        if (!manager) return null;
        if (manager.esOficina) return manager;
        if (manager.supervisorId) {
                    const sup = estado.managers.find(x => x.id === manager.supervisorId);
                    if (sup && sup.esOficina) return sup;
        }
        return null;
}

// Despues de cambiar el fondo (foto o video) de una oficina, refresca la pantalla que este
// abierta en ese momento: el panel del administrador, "Mi equipo", o la propia pantalla de
// saludo del manager de oficina (para que vea el cambio de inmediato, sin recargar la
// pagina). Asi este boton funciona igual de bien sea el admin o el propio manager quien lo use.
function refrescarTrasCambioFondo(managerId) {
        if (document.getElementById('pantallaAdmin').classList.contains('activa')) renderPanelAdmin();
        if (oficinaActivaId && document.getElementById('pantallaEquipo').classList.contains('activa')) verEquipo(oficinaActivaId, origenEquipo);
        if (document.getElementById('pantallaSaludo').classList.contains('activa') && managerActivoId === managerId) {
                    const m = estado.managers.find(x => x.id === managerActivoId);
                    if (m) prepararSaludo(m);
        }
}

// Aplica (o quita) el fondo personalizado de la oficina del manager que acaba de abrir su
// link. Se llama SOLO desde prepararSaludo(), que a su vez solo se llama cuando alguien
// entra con un link de manager (?manager=...) — el panel del admin nunca pasa por aqui,
// asi que la vista del admin nunca se ve afectada. Si la oficina tiene video Y foto a la
// vez, el video tiene prioridad (se ve mas completo); si no tiene ninguno, se deja el fondo
// de siempre.
function aplicarFondoPersonalizado(manager) {
        document.body.classList.remove('fondo-personalizado-activo', 'fondo-video-activo');
        const videoExistente = document.getElementById('fondoVideoPersonalizado');
        if (videoExistente) videoExistente.remove();

        const oficina = oficinaDe(manager);

        // Marca "TEAM FENIX": pedido especifico de Omar Aliaga, solo para su cuenta y la de
        // su equipo (sub-managers que dependen de el como oficina). Por eso el ID esta fijo
        // aqui en vez de ser configurable como el fondo/video/audio de las demas oficinas.
        const ID_OFICINA_TEAM_FENIX = '97e4ragu';
        const marcaTeamFenix = document.getElementById('marcaTeamFenix');
        if (marcaTeamFenix) {
                    marcaTeamFenix.style.display = (oficina && oficina.id === ID_OFICINA_TEAM_FENIX) ? '' : 'none';
        }

        if (oficina && oficina.fondoVideoUrl) {
                    const video = document.createElement('video');
                    video.id = 'fondoVideoPersonalizado';
                    video.src = oficina.fondoVideoUrl;
                    video.autoplay = true;
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true;
                    document.body.insertBefore(video, document.body.firstChild);
                    document.body.classList.add('fondo-video-activo');
                    return;
        }

        if (oficina && oficina.fondoVersion) {
                    const url = `/api/imagen-fondo?manager=${oficina.id}&v=${oficina.fondoVersion}`;
                    document.body.style.setProperty('--fondo-personalizado', `url("${url}")`);
                    document.body.classList.add('fondo-personalizado-activo');
        }
}

// Convierte una direccion de texto en coordenadas (lat/lng).
// Primero intenta con el geocodificador del Census Bureau de EE.UU. (gratis, sin limite,
// hecho especificamente para direcciones de EE.UU.). Si no encuentra la direccion, usa
// Nominatim como respaldo (con la pausa que exige su politica de uso).
async function geocodificarCensus(direccion) {
        try {
                    const url = `/api/geocode?direccion=${encodeURIComponent(direccion)}`;
                    const r = await fetch(url);
                    const data = await r.json();
                    if (data && data.lat != null && data.lng != null) {
                                    return { lat: data.lat, lng: data.lng };
                    }
        } catch (e) { console.error('Geocodificacion Census fallo', e); }
        return null;
}

async function geocodificarNominatim(direccion) {
    try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=${PAIS_GEOCODIFICACION}&q=${encodeURIComponent(direccion)}`;
          const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
          const data = await r.json();
          const resultado = data && data[0];
          if (resultado && resultado.address && resultado.address.country_code === PAIS_GEOCODIFICACION) {
                  return { lat: parseFloat(resultado.lat), lng: parseFloat(resultado.lon) };
          }
    } catch (e) { console.error('Geocodificacion Nominatim fallo', e); }
    return null;
}

async function geocodificar(direccion) {
    const censo = await geocodificarCensus(direccion);
    if (censo) return censo;
    await esperar(1100);
    return await geocodificarNominatim(direccion);
}

function normalizarTexto(s) {
    return String(s || '').toLowerCase().replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ñ/g,'n').trim();
}

// Lee un archivo Excel/CSV y devuelve filas [codigo, nombre, direccionCompleta].
// Detecta automaticamente en que columna esta el Nombre y la Direccion buscando
// esas palabras en la fila de encabezados, sin importar cuantas columnas haya antes
// (Numero de parada, Codigo, etc.) ni en que orden vengan.
function leerExcel(archivo) {
        return new Promise((resolve, reject) => {
                    const lector = new FileReader();
                    lector.onload = (e) => {
                                    try {
                                                        const wb = XLSX.read(e.target.result, { type: 'array' });
                                                        const hoja = wb.Sheets[wb.SheetNames[0]];
                                                        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });

                                                        let colNombre = -1, colDireccion = -1, colCodigo = -1, colCiudad = -1, filaInicio = 0;
                                                        for (let f = 0; f < Math.min(filas.length, 5); f++) {
                                                                                const fila = filas[f] || [];
                                                                                const nIdx = fila.findIndex(v => normalizarTexto(v).includes('nombre'));
                                                                                const dIdx = fila.findIndex(v => normalizarTexto(v).includes('direcc'));
                                                                                if (nIdx !== -1 && dIdx !== -1) {
                                                                                                            colNombre = nIdx;
                                                                                                            colDireccion = dIdx;
                                                                                                            colCodigo = fila.findIndex(v => normalizarTexto(v).includes('codigo'));
                                                                                                            colCiudad = fila.findIndex(v => normalizarTexto(v).includes('ciudad') || normalizarTexto(v).includes('estado') || normalizarTexto(v).includes('zip') || normalizarTexto(v).includes('city') || normalizarTexto(v).includes('state'));
                                                                                                            filaInicio = f + 1;
                                                                                                            break;
                                                                                    }
                                                        }

                                                        let resultado;
                                                        if (colNombre !== -1) {
                                                                                resultado = filas.slice(filaInicio)
                                                                                    .filter(f => f[colNombre] && f[colDireccion])
                                                                                    .map(f => [
                                                                                                                    colCodigo !== -1 && f[colCodigo] ? String(f[colCodigo]).trim() : '',
                                                                                                                    String(f[colNombre]).trim(),
                                                                                                                    colCiudad !== -1 && f[colCiudad] ? `${String(f[colDireccion]).trim()}, ${String(f[colCiudad]).trim()}` : String(f[colDireccion]).trim()
                                                                                                                ]);
                                                        } else {
                                                                                let inicio = 0;
                                                                                if (filas[0] && String(filas[0][0]).toLowerCase().includes('nombre')) inicio = 1;
                                                                                resultado = filas.slice(inicio)
                                                                                    .filter(f => f[0] && f[1])
                                                                                    .map(f => ['', String(f[0]).trim(), f[2] ? `${String(f[1]).trim()}, ${String(f[2]).trim()}` : String(f[1]).trim()]);
                                                        }
                                                        resolve(resultado);
                                    } catch (err) { reject(err); }
                    };
                    lector.onerror = reject;
                    lector.readAsArrayBuffer(archivo);
        });
}

async function cargarCartera() {
        if (cargaCarteraActiva) return;
        const archivo = document.getElementById('archivoCarteraExcel').files[0];
        const texto = document.getElementById('textoCartera').value.trim();
        const preview = document.getElementById('previewCartera');

        let filas = [];
        if (archivo) {
                    preview.textContent = 'Leyendo el Excel...';
                    filas = await leerExcel(archivo);
        } else if (texto) {
                    filas = texto.split('\n').map(l => l.trim()).filter(Boolean)
                        .map(linea => {
                                            const partes = linea.split(',').map(p => p.trim());
                                            const nombre = partes[0] || '';
                                            const direccion = partes[1] || '';
                                            const resto = partes.slice(2).join(', ');
                                            return ['', nombre, resto ? `${direccion}, ${resto}` : direccion];
                        });
        } else {
                    return;
        }

        const miToken = ++cargaCarteraToken;
        const managerDestino = managerCarteraActual;
        cargaCarteraActiva = true;
        document.getElementById('btnCargarCartera').style.display = 'none';
        document.getElementById('btnDetenerCarga').style.display = '';

        const sinUbicar = [];
        const nuevosClientes = [];

        for (let i = 0; i < filas.length; i++) {
                    if (miToken !== cargaCarteraToken) { cargaCarteraActiva = false; return; }
                    const [codigo, nombre, direccionCompleta] = filas[i];
                    if (!nombre || !direccionCompleta) continue;
                    preview.textContent = `Ubicando direccion ${i + 1} de ${filas.length}: ${nombre}...`;
                    const coords = await geocodificar(direccionCompleta);
                    if (miToken !== cargaCarteraToken) { cargaCarteraActiva = false; return; }
                    if (!coords) sinUbicar.push(nombre);
                    nuevosClientes.push({
                                    id: uid(),
                                    managerId: managerDestino,
                                    codigo,
                                    nombre,
                                    direccion: direccionCompleta,
                                    telefono: '',
                                    observaciones: '',
                                    lat: coords ? coords.lat : null,
                                    lng: coords ? coords.lng : null,
                                    estatus: 'pendiente',
                                    citaFecha: '', citaHora: '', citaTelefono: '', citaObservaciones: '',
                                    horaLlegada: null,                    fechaCarga: new Date().toISOString()
                    });
        }

        if (miToken !== cargaCarteraToken) { cargaCarteraActiva = false; return; }

        // Bloqueamos este manager mientras se guarda la lista nueva, para que no se pueda
        // borrar su cartera al mismo tiempo desde otra pantalla/pestaña (evita el choque
        // que hacia reaparecer clientes ya borrados).
        bloquearManager(managerDestino);
        // "Cargar cartera" SIEMPRE reemplaza lo que ese manager ya tenia: en el mismo
        // guardado se quita su lista anterior y se mete la lista nueva. Antes esto solo
        // agregaba clientes encima de los que ya hubiera, y si no se usaba "Borrar" a mano
        // justo antes (o esa lista errada nunca se borraba), la cartera vieja se quedaba
        // mezclada para siempre con la nueva. Al hacerlo todo en un solo paso, ya no hay
        // forma de que conviva lo viejo con lo nuevo.
        // El chequeo "if (!existe) push" se mantiene por si actualizarEstado reintenta
        // (verificacion lenta): evita que la MISMA lista nueva se duplique en el reintento.
        await actualizarEstado((est) => {
                    est.clientes = est.clientes.filter(c => c.managerId !== managerDestino);
                    const idsExistentes = new Set(est.clientes.map(c => c.id));
                    nuevosClientes.forEach(c => { if (!idsExistentes.has(c.id)) est.clientes.push(c); });
        });
        desbloquearManager(managerDestino);

        cargaCarteraActiva = false;
        document.getElementById('btnCargarCartera').style.display = '';
        document.getElementById('btnDetenerCarga').style.display = 'none';

        if (sinUbicar.length > 0) {
                    preview.textContent = `Se cargaron ${filas.length} clientes. ${sinUbicar.length} no se pudieron ubicar en el mapa (revisa calle, ciudad y estado): ${sinUbicar.join(', ')}.`;
        } else {
                    preview.textContent = `Listo, se ubicaron correctamente los ${filas.length} clientes.`;
        }
        renderPanelAdmin();
        if (sinUbicar.length === 0) {
                    setTimeout(() => cerrarModal('modalCartera'), 900);
        }
}

// ============================================================
// GRAFICOS 3D PARA LOS REPORTES DE EXCEL
// ============================================================
// Aclaracion tecnica: Excel no permite insertar "graficos nativos editables" desde el
// navegador con las librerias gratuitas que tenemos disponibles (eso es una funcion de
// pago). En su lugar, dibujamos el grafico 3D nosotros mismos como una imagen (con un
// <canvas>, el mismo truco que usan las apps para hacer capturas) y esa imagen se inserta
// dentro de la hoja de Excel. Se ve igual de bien, solo que no se puede "editar" el
// grafico dentro de Excel como si fuera una tabla dinamica.

// Aclara u oscurece un color hexadecimal (#RRGGBB). porcentaje positivo = mas claro,
// negativo = mas oscuro. Se usa para simular las caras de arriba/lado de cada barra 3D.
function sombrearColor(hex, porcentaje) {
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) + Math.round(255 * (porcentaje / 100));
    let g = ((num >> 8) & 0x00FF) + Math.round(255 * (porcentaje / 100));
    let b = (num & 0x0000FF) + Math.round(255 * (porcentaje / 100));
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// Dibuja un grafico de barras 3D (isometrico) con los 4 numeros de siempre: gestionados,
// por gestionar, citas y retirados. Devuelve una imagen PNG en base64 lista para insertar
// en Excel. "datos" es un arreglo de { etiqueta, valor, color }.
function dibujarGrafico3D(datos, titulo) {
    const ancho = 560, alto = 340;
    const canvas = document.createElement('canvas');
    canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext('2d');

    // Fondo blanco (para que se vea bien insertado sobre las celdas de Excel)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ancho, alto);

    // Titulo
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(titulo, ancho / 2, 34);

    const depth = 22; // que tan "profunda" se ve cada barra
    const margenInferior = 54;
    const margenSuperior = 60;
    const baseY = alto - margenInferior;
    const maxValor = Math.max(1, ...datos.map(d => d.valor));
    const altoMaxBarra = baseY - margenSuperior - depth;

    const anchoBarra = 78;
    const espacio = (ancho - depth - datos.length * anchoBarra) / (datos.length + 1);

    datos.forEach((d, i) => {
        const x0 = espacio + i * (anchoBarra + espacio);
        const h = Math.max(2, (d.valor / maxValor) * altoMaxBarra);
        const yTop = baseY - h;

        const colorFrente = d.color;
        const colorArriba = sombrearColor(d.color, 28);
        const colorLado = sombrearColor(d.color, -18);

        // Cara lateral (derecha)
        ctx.fillStyle = colorLado;
        ctx.beginPath();
        ctx.moveTo(x0 + anchoBarra, yTop);
        ctx.lineTo(x0 + anchoBarra + depth, yTop - depth);
        ctx.lineTo(x0 + anchoBarra + depth, baseY - depth);
        ctx.lineTo(x0 + anchoBarra, baseY);
        ctx.closePath();
        ctx.fill();

        // Cara de arriba
        ctx.fillStyle = colorArriba;
        ctx.beginPath();
        ctx.moveTo(x0, yTop);
        ctx.lineTo(x0 + depth, yTop - depth);
        ctx.lineTo(x0 + anchoBarra + depth, yTop - depth);
        ctx.lineTo(x0 + anchoBarra, yTop);
        ctx.closePath();
        ctx.fill();

        // Cara frontal
        ctx.fillStyle = colorFrente;
        ctx.fillRect(x0, yTop, anchoBarra, h);

        // Numero arriba de la barra
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 17px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(d.valor), x0 + anchoBarra / 2 + depth / 2, yTop - depth - 8);

        // Etiqueta abajo
        ctx.fillStyle = '#475569';
        ctx.font = '12px Arial';
        const palabras = d.etiqueta.split(' ');
        if (palabras.length > 1 && d.etiqueta.length > 12) {
            ctx.fillText(palabras.slice(0, Math.ceil(palabras.length / 2)).join(' '), x0 + anchoBarra / 2, baseY + 18);
            ctx.fillText(palabras.slice(Math.ceil(palabras.length / 2)).join(' '), x0 + anchoBarra / 2, baseY + 33);
        } else {
            ctx.fillText(d.etiqueta, x0 + anchoBarra / 2, baseY + 18);
        }
    });

    // Linea base
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(0, baseY + 1);
    ctx.lineTo(ancho, baseY + 1);
    ctx.stroke();

    return canvas.toDataURL('image/png');
}

// Arma los 4 datos de siempre (gestionados/por gestionar/citas/retirados) en el formato
// que espera dibujarGrafico3D, usando los mismos colores que la dona de la app.
function datosGraficoDeClientes(clientes) {
    const { porGestionar, enSeguimiento, citas, retirados } = contarGestion(clientes);
    return [
        { etiqueta: 'Por gestionar', valor: porGestionar, color: '#8A8F98' },
        { etiqueta: 'En seguimiento', valor: enSeguimiento, color: '#7C5CFF' },
        { etiqueta: 'Citas', valor: citas, color: '#FFB020' },
        { etiqueta: 'Retirados', valor: retirados, color: '#EF4444' }
    ];
}

// Convierte el grafico 3D (la misma imagen que se usa en el Excel) en un <img> listo
// para mostrar dentro de la app, no solo para exportar.
function graficoImgHTML(clientes, titulo) {
    const dataUrl = dibujarGrafico3D(datosGraficoDeClientes(clientes), titulo);
    return `<img src="${dataUrl}" alt="Grafico 3D ${titulo}" style="width:100%;max-width:560px;display:block;margin:10px auto 0;border-radius:12px;box-shadow:0 2px 10px rgba(30,41,59,0.15);">`;
}

// Muestra u oculta el grafico 3D de un manager o de un grupo completo, justo debajo del
// boton que se toco. Al tocar el mismo boton de nuevo, se oculta (para no dejar la
// pantalla muy larga si hay muchos managers). "modo" puede ser:
//  - 'individual': un solo manager (managerId indica cual)
//  - 'admin': todos los managers del negocio (vista del administrador)
//  - 'equipo': todos los sub-managers de la oficina que se esta viendo en "Mi equipo"
function toggleGrafico3D(btn, contenedorId, managerId, modo) {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;
    if (cont.innerHTML) {
        cont.innerHTML = '';
        btn.textContent = '📊 Ver estadísticas 3D';
        return;
    }
    let clientes, titulo;
    if (modo === 'admin') {
        clientes = estado.clientes;
        titulo = 'Todos los managers';
    } else if (modo === 'equipo') {
        const idsSubs = subManagersDe(oficinaActivaId).map(m => m.id);
        clientes = estado.clientes.filter(c => idsSubs.includes(c.managerId));
        titulo = 'Mi equipo';
    } else {
        const m = estado.managers.find(x => x.id === managerId);
        clientes = estado.clientes.filter(c => c.managerId === managerId);
        titulo = m ? m.nombre : 'Manager';
    }
    cont.innerHTML = clientes.length > 0
        ? graficoImgHTML(clientes, titulo)
        : `<p class="texto-suave" style="margin:6px 0 0;">Todavia no hay clientes cargados para mostrar estadisticas.</p>`;
    btn.textContent = '📊 Ocultar estadísticas 3D';
}

// Pone primero a los clientes gestionados mas recientemente (para que en el Excel
// no queden salteados entre cientos de pendientes). Los que nunca se han tocado
// quedan al final, en el mismo orden en que se cargaron.
function ordenarPorGestionReciente(clientes) {
    return [...clientes].sort((a, b) => {
          if (a.fechaHoraLlegada && b.fechaHoraLlegada) return b.fechaHoraLlegada.localeCompare(a.fechaHoraLlegada);
          if (a.fechaHoraLlegada) return -1;
          if (b.fechaHoraLlegada) return 1;
          return 0;
    });
}

// Ordena los clientes en el mismo orden en que la app arma la ruta del dia (guardado en
// c.ordenRuta cada vez que un manager toca "Comenzar mi ruta" — ver construirRuta()).
// Esto es lo que se usa para los Excel exportables, para que el numero de la columna
// "Orden" corresponda exactamente al recorrido que la app calculo, del 1 hasta el ultimo,
// sin importar si el cliente ya fue gestionado o todavia esta pendiente. Los clientes que
// todavia no tienen ese numero (por ejemplo, recien cargados y el manager no ha abierto su
// ruta todavia) quedan al final, en el orden en que se cargaron.
function ordenarPorRuta(clientes) {
    return [...clientes].sort((a, b) => {
          const oa = a.ordenRuta, ob = b.ordenRuta;
          if (oa != null && ob != null) return oa - ob;
          if (oa != null) return -1;
          if (ob != null) return 1;
          return 0;
    });
}

// Parte una direccion guardada como texto unico ("calle, ciudad, XX 12345") en dos partes
// SOLO para mostrarla en los reportes exportables: calle y ciudad (ciudad, estado y codigo
// postal juntos). El dato original guardado en el cliente (c.direccion) NO se toca, asi que
// la navegacion con Google Maps y el mapa dentro de la app siguen funcionando exactamente
// igual que siempre; esto es nada mas una transformacion de presentacion para el Excel.
// Tambien limpia un error de datos viejo donde algunas direcciones quedaron con el estado
// repetido dos veces al final (ej: "Oxford, NC 27565-7206, NC" -> "Oxford, NC 27565-7206").
function separarDireccion(direccionCompleta) {
    if (!direccionCompleta) return { calle: '', ciudad: '' };
    const idx = direccionCompleta.indexOf(',');
    if (idx === -1) return { calle: direccionCompleta.trim(), ciudad: '' };
    const calle = direccionCompleta.slice(0, idx).trim();
    let ciudad = direccionCompleta.slice(idx + 1).trim();
    const matchDuplicado = ciudad.match(/^(.*\b([A-Za-z]{2})\s+\d{5}(\s*-\s*\d{4})?),\s*([A-Za-z]{2})\s*$/);
    if (matchDuplicado && matchDuplicado[2].toUpperCase() === matchDuplicado[4].toUpperCase()) {
        ciudad = matchDuplicado[1].trim();
    }
    return { calle, ciudad };
}

// Quita caracteres que Excel no permite en el nombre de una pestaña (\ / ? * [ ] :)
// y la recorta a 31 caracteres (el limite de Excel).
function nombreHojaSeguro(nombre) {
    return (nombre || 'Manager').replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Manager';
}

// Escribe una tabla (arreglo de objetos, como los que arma XLSX.utils.json_to_sheet)
// empezando en la fila indicada, con encabezados en negrita y columnas con ancho
// automatico. Devuelve la siguiente fila libre despues de la tabla.
function escribirTablaDesdeObjetos(hoja, filaInicio, filas) {
    if (!filas || filas.length === 0) return filaInicio;
    const columnas = Object.keys(filas[0]);
    const filaEncabezado = hoja.getRow(filaInicio);
    columnas.forEach((col, i) => {
          const celda = filaEncabezado.getCell(i + 1);
          celda.value = col;
          celda.font = { bold: true };
    });
    filas.forEach((obj, idx) => {
          const fila = hoja.getRow(filaInicio + 1 + idx);
          columnas.forEach((col, i) => { fila.getCell(i + 1).value = obj[col] ?? ''; });
    });
    columnas.forEach((col, i) => {
          const anchoMax = Math.max(col.length, ...filas.map(f => String(f[col] ?? '').length));
          hoja.getColumn(i + 1).width = Math.min(40, Math.max(10, anchoMax + 2));
    });
    return filaInicio + 1 + filas.length;
}

// Inserta el grafico 3D de un canjunto de clientes en la esquina superior izquierda de
// la hoja, dejando espacio libre debajo para la tabla de datos. Devuelve la fila donde
// puede empezar la tabla sin toparse con la imagen.
function insertarGrafico3DEnHoja(wb, hoja, clientes, titulo) {
    const imagenBase64 = dibujarGrafico3D(datosGraficoDeClientes(clientes), titulo);
    const idImagen = wb.addImage({ base64: imagenBase64, extension: 'png' });
    hoja.addImage(idImagen, { tl: { col: 0, row: 0 }, ext: { width: 560, height: 340 } });
    return 19; // ~340px de imagen a ~20px por fila, mas un respiro
}

// Convierte el workbook de ExcelJS en un archivo .xlsx descargable y lo dispara.
async function descargarWorkbook(wb, nombreArchivo) {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportarExcelGeneral() {
      const resumen = [];
      const consolidado = [];
      const hojasPorManager = [];
      let clientesDeTodoElEquipo = [];

      estado.managers.forEach(m => {
              const clientesM = ordenarPorRuta(estado.clientes.filter(c => c.managerId === m.id));
              clientesDeTodoElEquipo = clientesDeTodoElEquipo.concat(clientesM);

              hojasPorManager.push({
                        nombre: m.nombre,
                        clientes: clientesM,
                        filas: clientesM.map((c, idx) => {
                                    const { calle, ciudad } = separarDireccion(c.direccion);
                                    return {
                                    Orden: idx + 1,
                                    Codigo: c.codigo || '',
                                    Estatus: c.estatus,
                                    Nombre: c.nombre,
                                    Direccion: calle,
                                    Ciudad: ciudad,
                                    Telefono: c.telefono,
                            'Fecha de gestion': formatearSoloFecha(c.fechaHoraLlegada), 'Hora de gestion': formatearSoloHora(c.fechaHoraLlegada),
                                    'Fecha cita': c.citaFecha || '',
                                    'Hora cita': c.citaHora || '',
                                    'Telefono cita': c.citaTelefono || '',
                                    'Observaciones cita': c.citaObservaciones || '',
                                    'Hora de visita': c.horaLlegada || '',
                                    Observaciones: c.observaciones || ''
                                    };
                        })
              });

              const resumenM = contarGestion(clientesM);
              resumen.push({
                        Manager: m.nombre,
                        'Total clientes': clientesM.length,
                        Gestionados: resumenM.gestionados,
                        'Por gestionar': resumenM.porGestionar,
                        'Citas efectivas': resumenM.citas,
                        Retirados: resumenM.retirados,
                        'Vencimiento': formatearFechaSimple(m.fechaVencimiento)
              });

              clientesM.forEach((c, idx) => {
                        const { calle, ciudad } = separarDireccion(c.direccion);
                        consolidado.push({
                                    Manager: m.nombre,
                                    Orden: idx + 1,
                                    Codigo: c.codigo || '',
                                    Estatus: c.estatus,
                                    Nombre: c.nombre,
                                    Direccion: calle,
                                    Ciudad: ciudad,
                                    Telefono: c.telefono,
                                    'Fecha de gestion': formatearSoloFecha(c.fechaHoraLlegada), 'Hora de gestion': formatearSoloHora(c.fechaHoraLlegada),
                                    'Fecha cita': c.citaFecha || '',
                                    'Hora cita': c.citaHora || '',
                                    'Telefono cita': c.citaTelefono || '',
                                    'Observaciones cita': c.citaObservaciones || '',
                                    Observaciones: c.observaciones || ''
                        });
              });
      });

      const wb = new ExcelJS.Workbook();
      const nombresUsados = new Set(['Todos los clientes', 'Resumen']);

      // Hoja Resumen: grafico 3D grupal (todo el equipo junto) + la tabla de siempre.
      const hojaResumen = wb.addWorksheet('Resumen');
      const filaTablaResumen = insertarGrafico3DEnHoja(wb, hojaResumen, clientesDeTodoElEquipo, 'Equipo completo');
      escribirTablaDesdeObjetos(hojaResumen, filaTablaResumen, resumen);

      // Hoja con todos los clientes de todos los managers juntos (sin grafico, es la
      // hoja "de trabajo" para filtrar/buscar).
      const hojaConsolidada = wb.addWorksheet('Todos los clientes');
      escribirTablaDesdeObjetos(hojaConsolidada, 1, consolidado);

      // Una hoja por manager, cada una con su propio grafico 3D arriba de su tabla.
      hojasPorManager.forEach(h => {
              let nombreHoja = nombreHojaSeguro(h.nombre);
              let sufijo = 2;
              while (nombresUsados.has(nombreHoja)) { nombreHoja = nombreHojaSeguro(h.nombre).slice(0, 28) + ' ' + sufijo; sufijo++; }
              nombresUsados.add(nombreHoja);
              const hoja = wb.addWorksheet(nombreHoja);
              const filaTabla = insertarGrafico3DEnHoja(wb, hoja, h.clientes, h.nombre);
              escribirTablaDesdeObjetos(hoja, filaTabla, h.filas);
      });

      await descargarWorkbook(wb, `Quantica_Rutas_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ============================================================
// VISTA MANAGER — SALUDO
// ============================================================
function prepararSaludo(manager) {
        aplicarFondoPersonalizado(manager);
        reproducirAudioBienvenida(manager);
        document.getElementById('saludoNombre').textContent = `¡Hola, ${manager.nombre.split(' ')[0]}!`;
        const pendientes = estado.clientes.filter(c => c.managerId === manager.id && c.estatus !== 'retirado' && !c.horaLlegada);
        document.getElementById('saludoResumen').textContent =
                    pendientes.length > 0
                ? `Esta es tu ruta de hoy: tienes ${pendientes.length} cliente${pendientes.length === 1 ? '' : 's'} por visitar.`
                        : `No tienes clientes pendientes por ahora. Avísale a tu administrador si esperas cartera nueva.`;
        const btnEquipo = document.getElementById('btnMiEquipo');
        if (btnEquipo) btnEquipo.style.display = manager.esOficina ? '' : 'none';
        // Los botones para cambiar el fondo (foto/video) solo se ven si este manager ES la
        // oficina (no un sub-manager): asi cada oficina controla su propio fondo, y no hay
        // confusion de "cual sub-manager cambio el fondo de todos".
        const btnMiFondo = document.getElementById('btnMiFondo');
        if (btnMiFondo) btnMiFondo.style.display = manager.esOficina ? '' : 'none';
        const btnMiFondoVideo = document.getElementById('btnMiFondoVideo');
        if (btnMiFondoVideo) btnMiFondoVideo.style.display = manager.esOficina ? '' : 'none';
        const btnMiFondoAudio = document.getElementById('btnMiFondoAudio');
        if (btnMiFondoAudio) btnMiFondoAudio.style.display = manager.esOficina ? '' : 'none';
        // Estadisticas 3D del propio manager, visibles apenas entra a la app cada dia,
        // antes de empezar a trabajar (sin tener que tocar ningun boton).
        const clientesM = estado.clientes.filter(c => c.managerId === manager.id);
        const contGrafico = document.getElementById('saludoGrafico3D');
        if (contGrafico) contGrafico.innerHTML = clientesM.length > 0 ? graficoImgHTML(clientesM, 'Tu avance') : '';
}

async function iniciarJornada() {
    // Volvemos a traer el estado mas reciente antes de arrancar, por si el administrador
    // desactivo esta cuenta mientras el manager ya tenia la app abierta.
    await cargarEstado();
    let manager = estado.managers.find(m => m.id === managerActivoId);
    if (!manager || manager.activo === false) {
        mostrarPantalla('pantallaCuentaDesactivada');
        return;
    }
    if (!manager.jornadaInicio || huboVisitaAyer(manager)) {
          await actualizarEstado((est) => {
                  const m = est.managers.find(x => x.id === managerActivoId);
                  if (m && (!m.jornadaInicio || huboVisitaAyer(m))) {
                            m.jornadaInicio = new Date().toISOString();
                            m.jornadaFin = null;
                  }
          });
          manager = estado.managers.find(m => m.id === managerActivoId);
    }
    await construirRuta(manager);
    mostrarPantalla('pantallaRuta');
}

function huboVisitaAyer() { return false; } // simplificado para Fase 1

// ============================================================
// CONSTRUIR RUTA (ordenar clientes por cercanía)
// ============================================================
function obtenerUbicacion() {
    return new Promise(resolve => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
                  pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                  () => resolve(null),
            { timeout: 5000 }
                );
    });
}

async function construirRuta(manager) {
    document.getElementById('rutaNombreManager').textContent = manager.nombre;

  // Los clientes ya visitados se ordenan por la hora real en que se gestionaron (no por el
  // orden en que estaban guardados internamente), para que el recorrido se vea tal como
  // realmente sucedio ese dia, en vez de saltar de un lado a otro sin sentido.
  const completados = estado.clientes
        .filter(c => c.managerId === manager.id && c.horaLlegada)
        .sort((a, b) => (a.fechaHoraLlegada || '').localeCompare(b.fechaHoraLlegada || ''));

  const pendientes = estado.clientes.filter(c =>
        c.managerId === manager.id && c.estatus !== 'retirado' && !c.horaLlegada && c.lat && c.lng
                                              );

  const pendientesSinCoords = estado.clientes.filter(c => c.managerId === manager.id && c.estatus !== 'retirado' && !c.horaLlegada && (!c.lat || !c.lng));
    let pendientesOrdenados = [];
    if (pendientes.length > 0) {
          const ubicacion = await obtenerUbicacion();
          let punto = ubicacion || { lat: pendientes[0].lat, lng: pendientes[0].lng };
          const restantes = [...pendientes];

      while (restantes.length) {
              let mejorIdx = 0, mejorDist = Infinity;
              restantes.forEach((c, i) => {
                        const d = distanciaKm(punto.lat, punto.lng, c.lat, c.lng);
                        if (d < mejorDist) { mejorDist = d; mejorIdx = i; }
              });
              const [elegido] = restantes.splice(mejorIdx, 1);
              pendientesOrdenados.push(elegido);
              punto = { lat: elegido.lat, lng: elegido.lng };
      }
    }

  rutaOrdenada = [...completados, ...pendientesOrdenados, ...pendientesSinCoords];
    indiceClienteActual = completados.length;
    renderClienteActual();

    // Guardamos el numero de orden (1, 2, 3...) de esta ruta en cada cliente, para que
    // despues los Excel exportables (general y "Mi Excel") puedan mostrar los clientes en
    // este mismo orden. No bloqueamos la pantalla esperando a que termine de guardarse: el
    // manager ya puede seguir trabajando mientras esto se guarda de fondo.
    const ordenPorId = {};
    rutaOrdenada.forEach((c, i) => { ordenPorId[c.id] = i + 1; });
    actualizarEstado((est) => {
        est.clientes.forEach(c => {
            if (ordenPorId[c.id] !== undefined) c.ordenRuta = ordenPorId[c.id];
        });
    });
}

// ============================================================
// VISTA MANAGER — CLIENTE ACTUAL
// ============================================================
function totalCompletadosHoy(manager) {
    return estado.clientes.filter(c => c.managerId === manager.id && c.horaLlegada).length;
}

function renderClienteActual() {
    const manager = estado.managers.find(m => m.id === managerActivoId);
    const totalHoy = rutaOrdenada.length;
    const completados = totalCompletadosHoy(manager);
    document.getElementById('rutaProgreso').textContent = `${completados} de ${totalHoy} completadas`;
    document.getElementById('barraProgreso').style.width = totalHoy ? `${(completados/totalHoy)*100}%` : '0%';

  const cont = document.getElementById('contenidoRuta');
    const hayAnterior = indiceClienteActual > 0;

  if (indiceClienteActual >= rutaOrdenada.length) {
        if (!manager.jornadaFin) {
                manager.jornadaFin = new Date().toISOString();
                actualizarEstado((est) => {
                          const m = est.managers.find(x => x.id === manager.id);
                          if (m && !m.jornadaFin) m.jornadaFin = new Date().toISOString();
                });
        }
        cont.innerHTML = `<div class="tarjeta vacio"><div class="vacio-emoji">🎉</div><h3>¡Terminaste tu ruta de hoy!</h3><p class="texto-suave">Buen trabajo. Cuando tengas cartera nueva, aparecerá aquí sola.</p>${hayAnterior ? `<button class="btn-texto" onclick="clienteAnterior()">⬅ Ver clientes visitados</button>` : ''}</div>`;
        return;
  }

  const c = rutaOrdenada[indiceClienteActual];
    const yaCompletado = !!c.horaLlegada;
    const etiquetas = { activo: '✅ Sigue activa', cita: '🟡 Cita efectiva', retirado: '🔴 No volver', no_atendio: '⚪ No atendio' };
    cont.innerHTML = `<div class="tarjeta-cliente"><span class="numero-visita">${yaCompletado ? `Cliente visitado · ${etiquetas[c.estatus] || ''}` : `Visita ${indiceClienteActual + 1} de ${rutaOrdenada.length}`}</span><div class="nombre-cliente">${c.nombre}</div><div class="direccion-cliente">📍 ${c.direccion}${c.telefono ? ' · 📞 ' + c.telefono : ''}</div>${c.observaciones ? `<div class="direccion-cliente">📝 ${c.observaciones}</div>` : ''}<a class="btn btn-teal" style="display:block; margin-bottom:14px; text-decoration:none;" href="https://www.google.com/maps/dir/?api=1&destination=${(c.lat&&c.lng)?`${c.lat},${c.lng}`:encodeURIComponent(c.direccion)}" target="_blank">🧭 Ir con navegación</a><div class="opciones-visita"><button class="btn btn-verde" onclick="marcarEstatus('activo')">${yaCompletado ? 'Cambiar a: sigue activa' : 'Sigue activa'}</button><button class="btn btn-coral" onclick="marcarEstatus('no_atendio')">${yaCompletado ? 'Cambiar a: no atendio' : '⚪ No atendio'}</button><button class="btn btn-rojo" onclick="confirmarRetiro()">${yaCompletado ? 'Cambiar a: no volver' : 'No volver'}</button><button class="btn btn-ambar" onclick="mostrarFormCita()">${yaCompletado ? 'Cambiar a: cita efectiva' : 'Cita efectiva'}</button></div><button class="btn-texto" onclick="toggleNotas()">📝 Notas (teléfono, observaciones)</button><div id="notasWrap"></div><div id="formCitaWrap"></div><div class="fila-2" style="margin-top:14px;">${hayAnterior ? `<button class="btn-texto" onclick="clienteAnterior()">⬅ Anterior</button>` : '<span></span>'}${yaCompletado ? `<button class="btn-texto" onclick="clienteSiguiente()">Siguiente ➡</button>` : '<span></span>'}</div></div>`;
}

function clienteAnterior() {
    if (indiceClienteActual > 0) {
          indiceClienteActual--;
          renderClienteActual();
    }
}

function clienteSiguiente() {
    if (indiceClienteActual < rutaOrdenada.length) {
          indiceClienteActual++;
          renderClienteActual();
    }
}

function toggleNotas() {
    const wrap = document.getElementById('notasWrap');
    if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
    const c = rutaOrdenada[indiceClienteActual];
    wrap.innerHTML = `<div class="form-cita"><div><label>Teléfono</label><input type="tel" id="notaTelefono" class="input" value="${c.telefono ? c.telefono.replace(/"/g,'&quot;') : ''}" placeholder="Teléfono de contacto"></div><div><label>Observaciones</label><textarea id="notaObservaciones" class="textarea" style="min-height:70px;" placeholder="Notas...">${c.observaciones || ''}</textarea></div><button class="btn btn-violeta" onclick="guardarNotas()">Guardar nota</button></div>`;
}

async function guardarNotas() {
    const c = rutaOrdenada[indiceClienteActual];
    const telefono = document.getElementById('notaTelefono').value.trim();
    const observaciones = document.getElementById('notaObservaciones').value.trim();
    await actualizarEstado((est) => {
          const clienteReal = est.clientes.find(x => x.id === c.id);
          clienteReal.telefono = telefono;
          clienteReal.observaciones = observaciones;
    });
    const actualizado = estado.clientes.find(x => x.id === c.id);
    const idx = rutaOrdenada.findIndex(x => x.id === c.id);
    if (idx !== -1) rutaOrdenada[idx] = actualizado;
    renderClienteActual();
}

function mostrarFormCita() {
    document.getElementById('formCitaWrap').innerHTML = `<div class="form-cita"><div class="fila-2"><div><label>Día</label><input type="date" id="citaFecha" class="input"></div><div><label>Hora</label><input type="time" id="citaHora" class="input"></div></div><div><label>Teléfono</label><input type="tel" id="citaTelefono" class="input" placeholder="Teléfono de contacto"></div><div><label>Observaciones</label><textarea id="citaObservaciones" class="textarea" style="min-height:70px;" placeholder="Notas de la cita..."></textarea></div><button class="btn btn-ambar" onclick="marcarEstatus('cita')">Guardar cita y completar</button></div>`;
}

function confirmarRetiro() {
    const c = rutaOrdenada[indiceClienteActual];
    if (confirm(`¿Seguro que quieres marcar a "${c.nombre}" como no volver / retirado?`)) {
          marcarEstatus('retirado');
    }
}

async function marcarEstatus(tipo) {
    const c = rutaOrdenada[indiceClienteActual];
    const horaTexto = horaAhora();
    const fechaISO = new Date().toISOString();
    const citaFecha = tipo === 'cita' ? (document.getElementById('citaFecha')?.value || '') : undefined;
    const citaHora = tipo === 'cita' ? (document.getElementById('citaHora')?.value || '') : undefined;
    const citaTelefono = tipo === 'cita' ? (document.getElementById('citaTelefono')?.value || '') : undefined;
    const citaObservaciones = tipo === 'cita' ? (document.getElementById('citaObservaciones')?.value || '') : undefined;

const ok = await actualizarEstado((est) => {
        const clienteReal = est.clientes.find(x => x.id === c.id);
        clienteReal.estatus = tipo;
        clienteReal.horaLlegada = horaTexto;
        clienteReal.fechaHoraLlegada = fechaISO;
        if (tipo === 'cita') {
                    clienteReal.citaFecha = citaFecha;
                    clienteReal.citaHora = citaHora;
                    clienteReal.citaTelefono = citaTelefono;
                    clienteReal.citaObservaciones = citaObservaciones;
        }
});
    
    if (!ok) {
            alert('No se pudo guardar esta gestion. Revisa tu conexion e intenta de nuevo tocando el mismo boton.');
            return;
    }

  const actualizado = estado.clientes.find(x => x.id === c.id);
    const idx = rutaOrdenada.findIndex(x => x.id === c.id);
    if (idx !== -1) rutaOrdenada[idx] = actualizado;
    indiceClienteActual++;
    renderClienteActual();
}

// ============================================================
// VISTA MANAGER — MAPA COMPLETO
// ============================================================
function irAVistaMapa() {
    mostrarPantalla('pantallaMapaCompleto');
    document.getElementById('mapaResumen').textContent =
          `${rutaOrdenada.length} paradas pendientes en tu recorrido`;

  setTimeout(() => {
        if (mapaLeaflet) { mapaLeaflet.remove(); mapaLeaflet = null; }
        if (rutaOrdenada.length === 0) return;

                 mapaLeaflet = L.map('mapaGrande');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
        }).addTo(mapaLeaflet);

                 const conCoords = rutaOrdenada.filter(c => c.lat && c.lng); const puntos = conCoords.map(c => [c.lat, c.lng]);
        conCoords.forEach((c, i) => {
                const icono = L.divIcon({
                          className: '',
                          html: `<div class="numero-pin">${i + 1}</div>`,
                          iconSize: [30, 30]
                });
                L.marker([c.lat, c.lng], { icon: icono }).addTo(mapaLeaflet).bindPopup(`<b>${c.nombre}</b><br>${c.direccion}`);
        });

                 L.polyline(puntos, { color: '#7C5CFF', weight: 3, dashArray: '6 8' }).addTo(mapaLeaflet);
        if (puntos.length > 0) mapaLeaflet.fitBounds(puntos, { padding: [30, 30] });
  }, 50);
}

function volverAVistaRuta() { mostrarPantalla('pantallaRuta'); }

// ============================================================
// VISTA MANAGER — MI REPORTE
// ============================================================
function verMiReporte(managerId, origen) {
        managerReporteId = managerId || managerActivoId;
        origenReporte = origen || 'saludo';
        const manager = estado.managers.find(m => m.id === managerReporteId);
        if (!manager) return;
        document.getElementById('reporteManagerNombre').textContent = manager.nombre;
        const clientesM = estado.clientes.filter(c => c.managerId === manager.id);

        const { gestionados, porGestionar, citas, retirados } = contarGestion(clientesM);

        document.getElementById('reporteDona').setAttribute('style', `width:64px;height:64px;border-radius:50%;flex-shrink:0;${donaEstilo(clientesM)}`);
        document.getElementById('reporteResumenTexto').textContent = `${clientesM.length} clientes en total - ${gestionados} gestionados - ${porGestionar} por gestionar - ${citas} citas - ${retirados} no volver`;
        const reporteSemaforoEl = document.getElementById('reporteSemaforo');
        if (reporteSemaforoEl) reporteSemaforoEl.innerHTML = semaforoHTML(manager, clientesM, 'semaforo-reporte-detalle');

        const efectividad = tasaEfectividad(clientesM);
        const dias = diasActivaCartera(clientesM);
        const ritmo = clientesPorDia(clientesM);
        const fechaFin = fechaEstimadaFin(clientesM);
        const vencimientoTxt = manager.fechaVencimiento ? ` &nbsp;·&nbsp; <b>Vencimiento:</b> ${formatearFechaSimple(manager.fechaVencimiento)}` : '';
        const statsEl = document.getElementById('reporteStatsTexto');
        if (statsEl) statsEl.innerHTML = `<b>Efectividad:</b> ${efectividad != null ? efectividad + '%' : 'Sin datos aun'} &nbsp;·&nbsp; <b>Dias activa:</b> ${dias} &nbsp;·&nbsp; <b>Clientes/dia:</b> ${ritmo.toFixed(1)} &nbsp;·&nbsp; <b>Fin estimado:</b> ${fechaFin || 'Sin datos aun'}${vencimientoTxt}`;

        const etiquetas = { pendiente: 'Pendiente', activo: 'Sigue activa', cita: 'Cita efectiva', retirado: 'No volver', no_atendio: 'No atendio' };
        const ordenados = [...clientesM].sort((a, b) => (b.fechaHoraLlegada || '').localeCompare(a.fechaHoraLlegada || ''));

        document.getElementById('listaReporteManager').innerHTML = ordenados.map(c => {
                    const fecha = c.fechaHoraLlegada ? formatearFechaHora(c.fechaHoraLlegada) : 'Sin gestionar aun';
                    let detalleCita = '';
                    if (c.estatus === 'cita' && (c.citaFecha || c.citaHora || c.citaTelefono)) {
                                    const telefonoTxt = c.citaTelefono ? ` · Tel: ${c.citaTelefono}` : '';
                                    detalleCita = ` - Cita: ${c.citaFecha || ''} ${c.citaHora || ''}`.trim() + telefonoTxt;
                    }
                    return `<div class="fila-manager"><div class="fila-manager-info"><span class="fila-manager-nombre">${c.nombre}</span><span class="fila-manager-meta">${etiquetas[c.estatus] || c.estatus} - ${fecha}${detalleCita}</span></div></div>`;
        }).join('');

        mostrarPantalla('pantallaReporteManager');
}

function volverDeReporte() {
        if (origenReporte === 'admin') {
                    renderPanelAdmin();
                    mostrarPantalla('pantallaAdmin');
        } else if (origenReporte === 'ruta') {
                    mostrarPantalla('pantallaRuta');
        } else if (origenReporte === 'equipo') {
                    mostrarPantalla('pantallaEquipo');
        } else {
                    mostrarPantalla('pantallaSaludo');
        }
}

async function descargarMiExcel() {
      const manager = estado.managers.find(m => m.id === managerReporteId);
      if (!manager) return;
      const clientesM = ordenarPorRuta(estado.clientes.filter(c => c.managerId === manager.id));
      const filas = clientesM.map((c, idx) => {
              const { calle, ciudad } = separarDireccion(c.direccion);
              return {
              Orden: idx + 1,
              Codigo: c.codigo || '',
              Estatus: c.estatus,
              Nombre: c.nombre,
              Direccion: calle,
              Ciudad: ciudad,
              Telefono: c.telefono,
              'Fecha de gestion': formatearSoloFecha(c.fechaHoraLlegada), 'Hora de gestion': formatearSoloHora(c.fechaHoraLlegada),
              'Fecha cita': c.citaFecha || '',
              'Hora cita': c.citaHora || '',
              'Telefono cita': c.citaTelefono || '',
              'Observaciones cita': c.citaObservaciones || '',
              Observaciones: c.observaciones || ''
              };
      });
      const wb = new ExcelJS.Workbook();
      const hoja = wb.addWorksheet(nombreHojaSeguro(manager.nombre) || 'Mi reporte');
      const filaTabla = insertarGrafico3DEnHoja(wb, hoja, clientesM, manager.nombre);
      escribirTablaDesdeObjetos(hoja, filaTabla, filas);
      await descargarWorkbook(wb, `Reporte_${manager.nombre.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
