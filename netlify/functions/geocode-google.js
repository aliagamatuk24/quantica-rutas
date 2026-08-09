// Geocodifica una direccion usando la API de Google Maps (Geocoding API), como
// TERCER intento — solo se usa cuando el Census Bureau (geocode.js) Y Nominatim
// (OpenStreetMap, directo desde el navegador) ya fallaron los dos.
//
// Esto se hace desde el SERVIDOR (esta funcion de Netlify), nunca desde el
// navegador del manager, porque la llave de Google (GOOGLE_MAPS_API_KEY) esta
// guardada como variable de entorno secreta en Netlify. Si esa llave apareciera
// en el codigo que baja al navegador (app.js), cualquier persona podria verla
// (con solo "ver codigo fuente" de la pagina) y copiarla para usarla en sus
// propias apps, generando cargos en la cuenta de Google del negocio. Por eso
// la llave restringida solo por "Geocoding API" (no por sitio web) SOLO puede
// vivir aqui, en el servidor.
export default async (req) => {
    try {
        const url = new URL(req.url);
        const direccion = url.searchParams.get('direccion');
        if (!direccion) {
            return new Response(JSON.stringify({ error: 'Falta el parametro direccion' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            // Todavia no se configuro la llave en Netlify (Site configuration ->
            // Environment variables -> GOOGLE_MAPS_API_KEY): no es un error grave,
            // simplemente este tercer respaldo no esta disponible todavia. La app
            // sigue funcionando normal solo con Census + Nominatim.
            return new Response(JSON.stringify({ lat: null, lng: null, aviso: 'GOOGLE_MAPS_API_KEY no configurada' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(direccion)}&key=${apiKey}`;
        const r = await fetch(googleUrl);
        const data = await r.json();
        const resultado = data && data.results && data.results[0];
        if (resultado && resultado.geometry && resultado.geometry.location) {
            return new Response(JSON.stringify({ lat: resultado.geometry.location.lat, lng: resultado.geometry.location.lng }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({ lat: null, lng: null, estadoGoogle: data && data.status }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = { path: '/api/geocode-google' };
