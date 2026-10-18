/* Nivva — camada de rastreamento
   Envia eventos para o dataLayer do GTM. Pixel, GA4 e demais tags
   sao configurados dentro do GTM, nao aqui.

   Eventos publicados:
   - nivva_page_context  (uma vez por pagina, com a origem da visita)
   - whatsapp_click      (todo clique em link wa.me)

   Carimbo de origem no WhatsApp:
   Quando a visita veio de anuncio, o texto pre-preenchido do WhatsApp ganha
   um codigo curto no fim, ex: "(ref. NV-M)". E a UNICA forma de o CRM saber
   que aquele lead veio do trafego pago: o clique no site nao passa adId nem
   UTM pro WhatsApp. Visita organica nao recebe carimbo nenhum.
     NV-M          anuncio da Meta (tem fbclid ou utm_source da Meta)
     NV-G          anuncio do Google (gclid)
     NV-A<base36>  anuncio da Meta com o ID do criativo em utm_content
                   (so aparece se o anuncio tiver url_tags com {{ad.id}})
*/
(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  var STORAGE_KEY = 'nivva_origem';
  var PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'ttclid', 'msclkid'
  ];

  // Guarda a origem da PRIMEIRA pagina da sessao. Sem isso, quem chega
  // por anuncio e navega ate outro artigo antes de clicar no WhatsApp
  // perde a campanha pelo caminho.
  function capturarOrigem() {
    var query = new URLSearchParams(window.location.search);
    var atual = {};
    var temParametro = false;

    PARAMS.forEach(function (p) {
      var v = query.get(p);
      if (v) {
        atual[p] = v;
        temParametro = true;
      }
    });

    var salvo = null;
    try {
      salvo = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      salvo = null;
    }

    if (temParametro) {
      atual.landing_page = window.location.pathname;
      atual.referrer = document.referrer || '';
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(atual));
      } catch (e) {}
      return atual;
    }

    if (salvo) return salvo;

    var organico = {
      landing_page: window.location.pathname,
      referrer: document.referrer || ''
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(organico));
    } catch (e) {}
    return organico;
  }

  var origem = capturarOrigem();

  window.dataLayer.push({
    event: 'nivva_page_context',
    pagina: window.location.pathname,
    origem: origem
  });

  // ---- Clique em WhatsApp ----------------------------------------------

  // Nomes de layout que nao dizem nada sobre onde a pessoa clicou.
  // Sem esse filtro, metade dos cliques vira "col" ou "wrap" no relatorio.
  var CLASSES_GENERICAS = /^(col|row|grid|flex|wrap|wrapper|container|content|inner|box|item|reveal|section|div)$/i;

  function primeiraClasseUtil(elemento) {
    if (!elemento || typeof elemento.className !== 'string') return null;
    var classes = elemento.className.trim().split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i] && !CLASSES_GENERICAS.test(classes[i])) return classes[i];
    }
    return null;
  }

  // Rotula o clique pra distinguir botao flutuante, CTA do topo e CTA do fim
  // do artigo sem ter que marcar os 322 links na mao. Ordem do mais
  // especifico (o proprio botao) pro mais generico (a secao da pagina).
  function rotuloDoLink(link) {
    if (link.dataset && link.dataset.trackLabel) return link.dataset.trackLabel;

    var doLink = primeiraClasseUtil(link);
    if (doLink) return doLink;

    var secao = link.closest('section, header, footer, nav, article');
    if (secao && secao.id) return secao.id;

    var doPai = primeiraClasseUtil(link.parentElement);
    if (doPai) return doPai;

    if (secao) return primeiraClasseUtil(secao) || secao.tagName.toLowerCase();
    return 'sem-secao';
  }

  // Botao flutuante e icone de rede social nao tem texto: sem isso o
  // relatorio mostra clique de botao vazio.
  function textoDoLink(link) {
    var texto = (link.innerText || '').trim();
    if (texto) return texto.slice(0, 80);
    var alternativo = link.getAttribute('aria-label') || link.getAttribute('title') || '';
    return alternativo.trim().slice(0, 80);
  }

  // ---- Carimbo de origem -------------------------------------------------

  var MARCA = '(ref. NV-';
  var FONTES_META = /^(facebook|fb|instagram|ig|meta|an|audience_network)$/i;

  // ID de anuncio da Meta tem 15 a 20 digitos: nao cabe em Number sem perder
  // precisao. Em base36 fica com ~11 caracteres. Sem BigInt, manda os digitos.
  function compactarId(digitos) {
    try {
      return 'A' + BigInt(digitos).toString(36);
    } catch (e) {
      return 'D' + digitos;
    }
  }

  function codigoDeOrigem(o) {
    if (!o) return null;
    var conteudo = String(o.utm_content || '');
    var fonte = String(o.utm_source || '');
    var ehMeta = !!o.fbclid || FONTES_META.test(fonte);
    if (/^\d{10,}$/.test(conteudo) && (ehMeta || !fonte)) return compactarId(conteudo);
    if (ehMeta) return 'M';
    if (o.gclid || /^google$/i.test(fonte)) return 'G';
    return null;
  }

  // Reescreve so o parametro `text` do link, preservando o resto. Nao usa
  // URLSearchParams.set porque ele troca espaco por "+", e nem todo WhatsApp
  // decodifica "+" como espaco.
  function carimbarLink(link, codigo) {
    var href = link.getAttribute('href') || '';
    var partes = href.split('?');
    var base = partes[0];
    var pares = partes[1] ? partes[1].split('&') : [];
    var texto = '';
    var resto = [];

    pares.forEach(function (par) {
      var i = par.indexOf('=');
      var chave = i < 0 ? par : par.slice(0, i);
      var valor = i < 0 ? '' : par.slice(i + 1);
      if (chave === 'text') {
        try { texto = decodeURIComponent(valor.replace(/\+/g, ' ')); } catch (e) { texto = valor; }
      } else {
        resto.push(par);
      }
    });

    if (texto.indexOf(MARCA) !== -1) return href; // ja carimbado num clique anterior

    var novoTexto = (texto ? texto + '\n\n' : '') + MARCA + codigo + ')';
    resto.push('text=' + encodeURIComponent(novoTexto));
    var novoHref = base + '?' + resto.join('&');
    link.setAttribute('href', novoHref);
    return novoHref;
  }

  var codigoSessao = codigoDeOrigem(origem);

  document.addEventListener('click', function (evento) {
    var link = evento.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    if (!link) return;

    // Carimba ANTES de registrar e antes da navegacao: o listener e de captura,
    // entao roda antes do navegador seguir o link.
    var destino = codigoSessao ? carimbarLink(link, codigoSessao) : link.getAttribute('href');

    window.dataLayer.push({
      event: 'whatsapp_click',
      pagina: window.location.pathname,
      titulo_pagina: document.title,
      secao: rotuloDoLink(link),
      texto_botao: textoDoLink(link),
      destino: destino,
      carimbo: codigoSessao ? 'NV-' + codigoSessao : '',
      origem: origem
    });
  }, true); // captura: registra o clique mesmo se outro handler parar a propagacao
})();
