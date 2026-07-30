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

// ---------- Utilidades ----------
function uid() { return Math.random().toString(36).slice(2, 10); }

function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function horaAhora() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

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
async function cargarEstado() {
  try {
    const r = await fetch(API);
    estado = await r.json();
  } catch (e) {
    console.error("No se pudo cargar el estado", e);
    estado = { managers: [], clientes: [] };
  }
}

async function guardarEstado() {
  try {
    await fetch(API, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(estado) });
  } catch (e) {
    console.error("No se pudo guardar", e);
  }
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
          const activos = clientesM.filter(c => c.estatus !== 'retirado').length;
          const pendientes = clientesM.filter(c => c.estatus === 'pendiente' || c.estatus === 'activo').length;
          const citas = clientesM.filter(c => c.estatus === 'cita').length;
          const retirados = clientesM.filter(c => c.estatus === 'retirado').length;
          const link = `${window.location.origin}${window.location.pathname}?manager=${m.id}`;
          return `
                <div class="fila-manager">
                        <div class="dona" style="${donaEstilo(clientesM)}" title="${pendientes} pendientes, ${citas} citas, ${retirados} retirados"></div>
                                <div class="fila-manager-info">
                                          <span class="fila-manager-nombre">${m.nombre}</span>
                                                    <span class="fila-manager-meta">${activos} activos · ${pendientes} pend · ${citas} citas · ${retirados} retirados</span>
                                                            </div>
                                                                    <div class="fila-manager-acciones">
                                                                              <button class="chip-link" onclick="copiarLink('${link}')">🔗 Copiar link</button>
                                                                                        <button class="btn-chico btn-teal" onclick="abrirModalCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">+ Cartera</button>
                                                                                                  <button class="btn-chico btn-vaciar" onclick="vaciarCartera('${m.id}', '${m.nombre.replace(/'/g,"")}')">🗑️</button>
                                                                                                          </div>
                                                                                                                </div>`;
    }).join('');
}

function donaEstilo(clientes) {
    const total = clientes.length;
    if (total === 0) return 'background:#E8E4F5;';
    const pendientes = clientes.filter(c => c.estatus === 'pendiente' || c.estatus === 'activo').length;
    const citas = clientes.filter(c => c.estatus === 'cita').length;
    const p1 = (pendientes / total) * 360;
    const p2 = p1 + (citas / total) * 360;
    return `background:conic-gradient(#8A8F98 0deg ${p1}deg, #FFB020 ${p1}deg ${p2}deg, #EF4444 ${p2}deg 360deg);`;
}

function vaciarCartera(managerId, nombre) {
    const clientesM = estado.clientes.filter(c => c.managerId === managerId);
    if (clientesM.length === 0) { alert('Ese manager ya no tiene clientes cargados.'); return; }
    if (!confirm(`¿Seguro que quieres borrar los ${clientesM.length} clientes de "${nombre}"? Esto no se puede deshacer.`)) return;
    if (!confirm(`Última confirmación: se van a borrar ${clientesM.length} clientes de "${nombre}" para siempre.`)) return;
    estado.clientes = estado.clientes.filter(c => c.managerId !== managerId);
    guardarEstado();
    renderPanelAdmin();
}
function copiarLink(link) {
  navigator.clipboard.writeText(link).then(() => alert('Link copiado. Envíaselo a tu manager por WhatsApp.'));
}

function crearManager() {
  const nombre = document.getElementById('nombreNuevoManager').value.trim();
  if (!nombre) return;
  estado.managers.push({ id: uid(), nombre, activo: true, jornadaInicio: null, jornadaFin: null });
  document.getElementById('nombreNuevoManager').value = '';
  cerrarModal('modalNuevoManager');
  guardarEstado();
  renderPanelAdmin();
}

let managerCarteraActual = null;
function abrirModalCartera(managerId, nombre) {
  managerCarteraActual = managerId;
  document.getElementById('nombreManagerCartera').textContent = nombre;
  document.getElementById('textoCartera').value = '';
  document.getElementById('previewCartera').textContent = '';
  mostrarModal('modalCartera');
}

// Convierte una direccion de texto en coordenadas (lat/lng).
// Primero intenta con el geocodificador del Census Bureau de EE.UU. (gratis, sin limite,
// hecho especificamente para direcciones de EE.UU.). Si no encuentra la direccion, usa
// Nominatim como respaldo (con la pausa que exige su politica de uso).
async function geocodificarCensus(direccion) {
    try {
          const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(direccion)}&benchmark=Public_AR_Current&format=json`;
          const r = await fetch(url);
          const data = await r.json();
          const match = data && data.result && data.result.addressMatches && data.result.addressMatches[0];
          if (match && match.coordinates) {
                  return { lat: match.coordinates.y, lng: match.coordinates.x };
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
                    
                            let colNombre = -1, colDireccion = -1, colCodigo = -1, filaInicio = 0;
                            for (let f = 0; f < Math.min(filas.length, 5); f++) {
                                        const fila = filas[f] || [];
                                        const nIdx = fila.findIndex(v => normalizarTexto(v).includes('nombre'));
                                        const dIdx = fila.findIndex(v => normalizarTexto(v).includes('direcc'));
                                        if (nIdx !== -1 && dIdx !== -1) {
                                                      colNombre = nIdx;
                                                      colDireccion = dIdx;
                                                      colCodigo = fila.findIndex(v => normalizarTexto(v).includes('codigo'));
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
                                                                      String(f[colDireccion]).trim()
                                                                    ]);
                            } else {
                                        // No se reconocieron encabezados: formato clasico A=nombre, B=direccion, C=ciudad/estado/zip
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
  
    const sinUbicar = [];
  
    for (let i = 0; i < filas.length; i++) {
          const [codigo, nombre, direccionCompleta] = filas[i];
          if (!nombre || !direccionCompleta) continue;
          preview.textContent = `Ubicando direccion ${i + 1} de ${filas.length}: ${nombre}...`;
          const coords = await geocodificar(direccionCompleta);
          if (!coords) sinUbicar.push(nombre);
          estado.clientes.push({
                  id: uid(),
                  managerId: managerCarteraActual,
                  codigo,
                  nombre,
                  direccion: direccionCompleta,
                  telefono: '',
                  observaciones: '',
                  lat: coords ? coords.lat : null,
                  lng: coords ? coords.lng : null,
                  estatus: 'pendiente',
                  citaFecha: '', citaHora: '', citaTelefono: '', citaObservaciones: '',
                  horaLlegada: null
          });
    }
  
    await guardarEstado();
  
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
function exportarExcelGeneral() {
  const wb = XLSX.utils.book_new();
  const resumen = [];

  estado.managers.forEach(m => {
    const clientesM = estado.clientes.filter(c => c.managerId === m.id);
    const filas = clientesM.map(c => ({
      Nombre: c.nombre,
      Dirección: c.direccion,
      Teléfono: c.telefono,
      Estatus: c.estatus,
      'Fecha cita': c.citaFecha || '',
      'Hora cita': c.citaHora || '',
      'Teléfono cita': c.citaTelefono || '',
      'Observaciones cita': c.citaObservaciones || '',
      'Hora de visita': c.horaLlegada || '',
      Observaciones: c.observaciones || ''
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, hoja, m.nombre.slice(0, 28) || 'Manager');
    resumen.push({
      Manager: m.nombre,
      'Total clientes': clientesM.length,
      Activos: clientesM.filter(c => c.estatus === 'activo' || c.estatus === 'pendiente').length,
      'Citas efectivas': clientesM.filter(c => c.estatus === 'cita').length,
      Retirados: clientesM.filter(c => c.estatus === 'retirado').length
    });
  });

  const hojaResumen = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, hojaResumen, 'Resumen', true);
  XLSX.writeFile(wb, `Quantica_Rutas_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ============================================================
// VISTA MANAGER — SALUDO
// ============================================================
function prepararSaludo(manager) {
  document.getElementById('saludoNombre').textContent = `¡Hola, ${manager.nombre.split(' ')[0]}!`;
  const pendientes = estado.clientes.filter(c => c.managerId === manager.id && c.estatus !== 'retirado' && !c.horaLlegada);
  document.getElementById('saludoResumen').textContent =
    pendientes.length > 0
      ? `Esta es tu ruta de hoy: tienes ${pendientes.length} cliente${pendientes.length === 1 ? '' : 's'} por visitar.`
      : `No tienes clientes pendientes por ahora. Avísale a tu administrador si esperas cartera nueva.`;
}

async function iniciarJornada() {
  const manager = estado.managers.find(m => m.id === managerActivoId);
  if (!manager.jornadaInicio || huboVisitaAyer(manager)) {
    manager.jornadaInicio = new Date().toISOString();
    manager.jornadaFin = null;
    await guardarEstado();
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

    // Clientes que este manager ya visito (para poder volver a revisarlos o corregirlos)
    const completados = estado.clientes.filter(c => c.managerId === manager.id && c.horaLlegada);

    const pendientes = estado.clientes.filter(c =>
          c.managerId === manager.id && c.estatus !== 'retirado' && !c.horaLlegada && c.lat && c.lng
        );

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

    rutaOrdenada = [...completados, ...pendientesOrdenados];
    indiceClienteActual = completados.length; // arranca justo en el primer pendiente
    renderClienteActual();
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
          if (!manager.jornadaFin) { manager.jornadaFin = new Date().toISOString(); guardarEstado(); }
          cont.innerHTML = `
                <div class="vacio">
                        <div class="vacio-emoji">🎉</div>
                                <h3>¡Terminaste tu ruta de hoy!</h3>
                                        <p class="texto-suave">Buen trabajo. Cuando tengas cartera nueva, aparecerá aquí sola.</p>
                                                ${hayAnterior ? `<button class="btn-texto" onclick="clienteAnterior()">⬅ Ver clientes visitados</button>` : ''}
                                                      </div>`;
          return;
    }

    const c = rutaOrdenada[indiceClienteActual];
    const yaCompletado = !!c.horaLlegada;
    const etiquetas = { activo: '✅ Sigue activa', cita: '🟡 Cita efectiva', retirado: '🔴 No volver' };
    cont.innerHTML = `
        <div class="tarjeta-cliente">
              <span class="numero-visita">${yaCompletado ? `Cliente visitado · ${etiquetas[c.estatus] || ''}` : `Visita ${indiceClienteActual + 1} de ${rutaOrdenada.length}`}</span>
                    <div class="nombre-cliente">${c.nombre}</div>
                          <div class="direccion-cliente">📍 ${c.direccion}${c.telefono ? ' · 📞 ' + c.telefono : ''}</div>
                                ${c.observaciones ? `<div class="direccion-cliente">📝 ${c.observaciones}</div>` : ''}

                                      <a class="btn btn-teal" style="display:block; margin-bottom:14px; text-decoration:none;"
                                               href="https://www.google.com/maps/dir/?api=1&destination=${(c.lat&&c.lng)?`${c.lat},${c.lng}`:encodeURIComponent(c.direccion)}" target="_blank">
                                                       🧭 Ir con navegación
                                                             </a>

                                                                   <div class="opciones-visita">
                                                                           <button class="btn btn-verde" onclick="marcarEstatus('activo')">${yaCompletado ? 'Cambiar a: sigue activa' : 'Sigue activa'}</button>
                                                                                   <button class="btn btn-rojo" onclick="confirmarRetiro()">${yaCompletado ? 'Cambiar a: no volver' : 'No volver'}</button>
                                                                                           <button class="btn btn-ambar" onclick="mostrarFormCita()">${yaCompletado ? 'Cambiar a: cita efectiva' : 'Cita efectiva'}</button>
                                                                                                 </div>

                                                                                                       <button class="btn-texto" onclick="toggleNotas()">📝 Notas (teléfono, observaciones)</button>
                                                                                                             <div id="notasWrap"></div>
                                                                                                                   <div id="formCitaWrap"></div>
                                                                                                                   
                                                                                                                         <div class="fila-2" style="margin-top:14px;">
                                                                                                                                 ${hayAnterior ? `<button class="btn-texto" onclick="clienteAnterior()">⬅ Anterior</button>` : '<span></span>'}
                                                                                                                                         ${yaCompletado ? `<button class="btn-texto" onclick="clienteSiguiente()">Siguiente ➡</button>` : '<span></span>'}
                                                                                                                                               </div>
                                                                                                                                                   </div>`;
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
    wrap.innerHTML = `
        <div class="form-cita">
              <div>
                      <label>Teléfono</label>
                              <input type="tel" id="notaTelefono" class="input" value="${c.telefono ? c.telefono.replace(/"/g,'&quot;') : ''}" placeholder="Teléfono de contacto">
                                    </div>
                                          <div>
                                                  <label>Observaciones</label>
                                                          <textarea id="notaObservaciones" class="textarea" style="min-height:70px;" placeholder="Notas...">${c.observaciones || ''}</textarea>
                                                                </div>
                                                                      <button class="btn btn-violeta" onclick="guardarNotas()">Guardar nota</button>
                                                                          </div>`;
}

async function guardarNotas() {
    const c = rutaOrdenada[indiceClienteActual];
    const clienteReal = estado.clientes.find(x => x.id === c.id);
    clienteReal.telefono = document.getElementById('notaTelefono').value.trim();
    clienteReal.observaciones = document.getElementById('notaObservaciones').value.trim();
    c.telefono = clienteReal.telefono;
    c.observaciones = clienteReal.observaciones;
    await guardarEstado();
    renderClienteActual();
}
function mostrarFormCita() {
  document.getElementById('formCitaWrap').innerHTML = `
    <div class="form-cita">
      <div class="fila-2">
        <div>
          <label>Día</label>
          <input type="date" id="citaFecha" class="input">
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="citaHora" class="input">
        </div>
      </div>
      <div>
        <label>Teléfono</label>
        <input type="tel" id="citaTelefono" class="input" placeholder="Teléfono de contacto">
      </div>
      <div>
        <label>Observaciones</label>
        <textarea id="citaObservaciones" class="textarea" style="min-height:70px;" placeholder="Notas de la cita..."></textarea>
      </div>
      <button class="btn btn-ambar" onclick="marcarEstatus('cita')">Guardar cita y completar</button>
    </div>`;
}

function confirmarRetiro() {
  const c = rutaOrdenada[indiceClienteActual];
  if (confirm(`¿Seguro que quieres marcar a "${c.nombre}" como no volver / retirado?`)) {
    marcarEstatus('retirado');
  }
}

async function marcarEstatus(tipo) {
  const c = rutaOrdenada[indiceClienteActual];
  const clienteReal = estado.clientes.find(x => x.id === c.id);
  clienteReal.estatus = tipo;
  clienteReal.horaLlegada = horaAhora();

  if (tipo === 'cita') {
    clienteReal.citaFecha = document.getElementById('citaFecha')?.value || '';
    clienteReal.citaHora = document.getElementById('citaHora')?.value || '';
    clienteReal.citaTelefono = document.getElementById('citaTelefono')?.value || '';
    clienteReal.citaObservaciones = document.getElementById('citaObservaciones')?.value || '';
  }

  await guardarEstado();
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

    const puntos = rutaOrdenada.map(c => [c.lat, c.lng]);
    rutaOrdenada.forEach((c, i) => {
      const icono = L.divIcon({
        className: '',
        html: `<div class="numero-pin">${i + 1}</div>`,
        iconSize: [30, 30]
      });
      L.marker([c.lat, c.lng], { icon: icono }).addTo(mapaLeaflet).bindPopup(`<b>${c.nombre}</b><br>${c.direccion}`);
    });

    L.polyline(puntos, { color: '#7C5CFF', weight: 3, dashArray: '6 8' }).addTo(mapaLeaflet);
    mapaLeaflet.fitBounds(puntos, { padding: [30, 30] });
  }, 50);
}

function volverAVistaRuta() { mostrarPantalla('pantallaRuta'); }
