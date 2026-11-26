// Entrega os vídeos com suporte a "Range" (pedaços do arquivo).
// O iPhone/Safari só toca vídeo se o servidor responder pedaços (status 206);
// sem isso o vídeo fica parado em 0:00. Os demais arquivos seguem direto para os ativos estáticos.

// Site de Dra. Milena (dramilenajacome.com.br): os arquivos ficam em /_dramilenajacome/
// neste mesmo projeto. Nesse domínio, "/" mostra essa pasta; em nivva.com.br a pasta
// não aparece (redireciona para o domínio dela, para não duplicar conteúdo no Google).
const PASTA_MILENA = '/_dramilenajacome';
const DOMINIO_MILENA = 'dramilenajacome.com.br';
const ARQUIVOS_COMPARTILHADOS = ['/favicon-32.png', '/apple-touch-icon.png', '/favicon.ico'];
const PASTAS_COMPARTILHADAS = ['/assets/'];

async function siteMilena(request, env, url) {
  if (url.hostname !== DOMINIO_MILENA) {
    return Response.redirect(`https://${DOMINIO_MILENA}${url.pathname}${url.search}`, 301);
  }
  if (ARQUIVOS_COMPARTILHADOS.includes(url.pathname) || PASTAS_COMPARTILHADAS.some((p) => url.pathname.startsWith(p))) {
    return env.ASSETS.fetch(request);
  }
  const caminho = url.pathname === '/' ? PASTA_MILENA : PASTA_MILENA + url.pathname;
  const resposta = await env.ASSETS.fetch(new Request(new URL(caminho, url.origin), request));
  if (resposta.status === 404) return Response.redirect(`https://${DOMINIO_MILENA}/`, 302);
  return resposta;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Um endereço só para a Nivva: www e http vão para https://nivva.com.br (evita cópia no Google).
    if (url.hostname === 'www.nivva.com.br' || (url.hostname === 'nivva.com.br' && url.protocol === 'http:')) {
      return Response.redirect(`https://nivva.com.br${url.pathname}${url.search}`, 301);
    }
    if (url.hostname.endsWith(DOMINIO_MILENA)) {
      return siteMilena(request, env, url);
    }
    if (url.pathname === PASTA_MILENA || url.pathname.startsWith(PASTA_MILENA + '/')) {
      const resto = url.pathname.slice(PASTA_MILENA.length) || '/';
      return Response.redirect(`https://${DOMINIO_MILENA}${resto}`, 301);
    }
    if (!url.pathname.endsWith('.mp4')) {
      return env.ASSETS.fetch(request);
    }

    // Busca o arquivo inteiro nos ativos (sem o cabeçalho Range).
    const assetReq = new Request(url.toString(), { method: 'GET' });
    const asset = await env.ASSETS.fetch(assetReq);
    if (!asset.ok) return asset;

    const body = await asset.arrayBuffer();
    const size = body.byteLength;
    const headers = new Headers(asset.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', 'video/mp4');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.delete('Content-Encoding');

    const range = request.headers.get('Range');
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      headers.set('Content-Length', String(size));
      return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
    }

    let start = match[1] === '' ? null : Number(match[1]);
    let end = match[2] === '' ? null : Number(match[2]);
    if (start === null) {
      // "bytes=-500": últimos 500 bytes
      start = Math.max(0, size - (end || 0));
      end = size - 1;
    } else if (end === null || end >= size) {
      end = size - 1;
    }
    if (start >= size || start > end) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }

    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(request.method === 'HEAD' ? null : body.slice(start, end + 1), { status: 206, headers });
  },
};
