// Geocodifica una direccion usando el geocodificador del Census Bureau de EE.UU.
// Se hace desde el servidor (no desde el navegador) porque el Census Bureau
// no permite llamadas directas desde el navegador (bloqueo CORS): el navegador
// del usuario nunca podia usar Census y siempre caia al respaldo Nominatim,
// que tiene peor cobertura en zonas rurales.
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
          const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(direccion)}&benchmark=Public_AR_Current&format=json`;
          const r = await fetch(censusUrl);
          const data = await r.json();
          const match = data && data.result && data.result.addressMatches && data.result.addressMatches[0];
          if (match && match.coordinates) {
                  return new Response(JSON.stringify({ lat: match.coordinates.y, lng: match.coordinates.x }), {
                            headers: { 'Content-Type': 'application/json' }
                  });
          }
          return new Response(JSON.stringify({ lat: null, lng: null }), {
                  headers: { 'Content-Type': 'application/json' }
          });
    } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' }
          });
    }
};

export const config = { path: '/api/geocode' };
