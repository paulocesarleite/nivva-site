/* Nivva — formulario antes do WhatsApp (somente paginas do blog)

   Quando a pessoa toca em qualquer botao de WhatsApp de um artigo, abre uma
   janela pedindo nome, WhatsApp e assunto. Ao enviar:
   1. o formulario e um <form> HTML comum: o script de rastreio externo do
      Triadeflow (external-tracking.js) captura o envio e cria o contato com a
      origem da visita (Google, Meta, organico, campanha, palavra-chave);
   2. publica o evento "lead_form_submit" no dataLayer (conversao no GTM);
   3. abre o WhatsApp com a mensagem pronta e um codigo de origem no fim,
      como reserva caso o contato nao seja criado.

   Quem nao quiser preencher toca em "Prefiro ir direto ao WhatsApp" e segue
   como antes. Depois de enviar uma vez, a janela nao aparece de novo na
   mesma sessao.
*/
(function () {
  'use strict';

  if (window.__nivvaLeadForm) return;
  window.__nivvaLeadForm = true;

  var TELEFONE_CLINICA = '5583999975033';
  var CHAVE_ENVIADO = 'nivva_lead_enviado';
  var CHAVE_ORIGEM = 'nivva_origem';

  var ASSUNTOS = [
    { valor: 'Reposição hormonal', codigo: 'RH', teste: /horm|menopaus|climat|fogacho|calorao|testosteron|libido|implante|andropaus|tpm|endometri|anticoncepcional|ovario|perimenopaus/ },
    { valor: 'Lipedema', codigo: 'LP', teste: /lipedema/ },
    { valor: 'Emagrecimento', codigo: 'EM', teste: /emagre|peso|mounjaro|ozempic|semaglutid|tirzepatid|caneta|obesid|sanfona|plato|gordura|metabol|dieta|compuls|insulin/ },
    { valor: 'Outro assunto', codigo: 'OU', teste: null }
  ];

  function lerOrigem() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_ORIGEM) || 'null') || {};
    } catch (e) {
      return {};
    }
  }

  function jaEnviou() {
    try { return sessionStorage.getItem(CHAVE_ENVIADO) === '1'; } catch (e) { return false; }
  }

  function marcarEnviado() {
    try { sessionStorage.setItem(CHAVE_ENVIADO, '1'); } catch (e) {}
  }

  function assuntoDaPagina() {
    var texto = (window.location.pathname + ' ' + document.title).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (var i = 0; i < ASSUNTOS.length; i++) {
      if (ASSUNTOS[i].teste && ASSUNTOS[i].teste.test(texto)) return ASSUNTOS[i];
    }
    return ASSUNTOS[ASSUNTOS.length - 1];
  }

  // Codigo curto que vai no fim da mensagem: G = Google, M = Meta, O = organico.
  function codigoOrigem(origem, assunto) {
    var canal = 'O';
    var fonte = (origem.utm_source || '').toLowerCase();
    if (origem.gclid || fonte.indexOf('google') !== -1) canal = 'G';
    else if (origem.fbclid || /facebook|instagram|meta|^fb$|^ig$/.test(fonte)) canal = 'M';
    return canal + '-' + assunto.codigo;
  }

  function somenteDigitos(v) { return (v || '').replace(/\D/g, ''); }

  // Aceita (83) 99999-9999, 83999999999 ou +55 83 99999-9999.
  function telefoneValido(v) {
    var d = somenteDigitos(v);
    if (d.length === 12 || d.length === 13) return d.indexOf('55') === 0;
    return d.length === 10 || d.length === 11;
  }

  function telefoneComDDI(v) {
    var d = somenteDigitos(v);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return '+' + d;
  }

  function linkWhatsApp(texto) {
    return 'https://wa.me/' + TELEFONE_CLINICA + '?text=' + encodeURIComponent(texto);
  }

  var CELULAR = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Sem espera: usado em "ir direto", nada a registrar antes.
  function abrirWhatsApp(url) {
    if (CELULAR) {
      window.location.href = url;
      return;
    }
    // Sem "noopener" no terceiro argumento: com ele o navegador devolve null
    // mesmo quando a aba abre, e a pagina sairia do artigo a toa.
    var janela = window.open(url, '_blank');
    if (janela) {
      try { janela.opener = null; } catch (e) {}
    } else {
      window.location.href = url;
    }
  }

  // Depois do envio: no celular o WhatsApp abre por cima e o navegador pode
  // pausar a pagina antes de o Triadeflow receber o formulario. Espera um
  // pouco para o envio sair. No computador abre em outra aba na hora, porque
  // a pagina continua viva.
  function abrirWhatsAppDepoisDoEnvio(url) {
    if (CELULAR) {
      setTimeout(function () { window.location.href = url; }, 900);
      return;
    }
    abrirWhatsApp(url);
  }

  // ---- Estilo -------------------------------------------------------------

  var css = '' +
    '.nlf-fundo{position:fixed;inset:0;background:rgba(14,39,38,.55);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s ease}' +
    '.nlf-fundo.nlf-aberto{opacity:1}' +
    '.nlf-caixa{background:var(--card,#fff);color:var(--text,#1a1a1a);font-family:var(--font-sans,system-ui,sans-serif);width:100%;max-width:440px;border-radius:18px 18px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .25s ease;max-height:92vh;overflow-y:auto;box-sizing:border-box}' +
    '.nlf-aberto .nlf-caixa{transform:none}' +
    '@media(min-width:640px){.nlf-fundo{align-items:center}.nlf-caixa{border-radius:18px}}' +
    '.nlf-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px}' +
    '.nlf-titulo{font-family:var(--font-serif,Georgia,serif);font-size:1.3rem;line-height:1.25;margin:0}' +
    '.nlf-fechar{background:none;border:0;font-size:1.6rem;line-height:1;color:var(--text-muted,#6f6f70);cursor:pointer;padding:0 2px}' +
    '.nlf-sub{font-size:.9rem;color:var(--text-muted,#6f6f70);margin:0 0 18px;line-height:1.5}' +
    '.nlf-campo{display:block;margin-bottom:14px}' +
    '.nlf-campo span{display:block;font-size:.82rem;color:var(--text-soft,#404040);margin-bottom:5px}' +
    '.nlf-campo input,.nlf-campo select{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:10px;background:#fff;color:inherit}' +
    '.nlf-campo input:focus,.nlf-campo select:focus{outline:none;border-color:var(--accent,#a07843)}' +
    '.nlf-erro{display:none;color:#b42318;font-size:.8rem;margin-top:5px}' +
    '.nlf-campo.nlf-invalido input{border-color:#b42318}' +
    '.nlf-campo.nlf-invalido .nlf-erro{display:block}' +
    '.nlf-enviar{width:100%;border:0;border-radius:10px;background:#25D366;color:#fff;font:inherit;font-size:1rem;font-weight:500;padding:13px;cursor:pointer;margin-top:4px}' +
    '.nlf-aviso{font-size:.75rem;color:var(--text-muted,#6f6f70);margin:12px 0 0;line-height:1.45;text-align:center}' +
    '.nlf-direto{display:block;width:100%;background:none;border:0;font:inherit;font-size:.85rem;color:var(--text-muted,#6f6f70);text-decoration:underline;margin-top:10px;cursor:pointer;padding:6px}';

  function injetarEstilo() {
    if (document.getElementById('nlf-estilo')) return;
    var s = document.createElement('style');
    s.id = 'nlf-estilo';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- Janela -------------------------------------------------------------

  var fundo = null;
  var linkOriginal = null;

  function opcoesAssunto(selecionado) {
    return ASSUNTOS.map(function (a) {
      return '<option value="' + a.valor + '"' + (a === selecionado ? ' selected' : '') + '>' + a.valor + '</option>';
    }).join('');
  }

  function montar() {
    injetarEstilo();
    var assunto = assuntoDaPagina();

    fundo = document.createElement('div');
    fundo.className = 'nlf-fundo';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', 'nlf-titulo');
    fundo.innerHTML = '' +
      '<div class="nlf-caixa">' +
        '<div class="nlf-topo">' +
          '<p class="nlf-titulo" id="nlf-titulo">Antes de abrir o WhatsApp</p>' +
          '<button type="button" class="nlf-fechar" aria-label="Fechar">×</button>' +
        '</div>' +
        '<p class="nlf-sub">Deixe seu nome e número. Se a conversa cair, a equipe de Dra. Milena retorna para você.</p>' +
        '<form id="nivva-lead-form" name="nivva-lead-form" class="nlf-form" novalidate>' +
          '<label class="nlf-campo" data-campo="name"><span>Seu nome</span>' +
            '<input type="text" name="name" autocomplete="name" placeholder="Ana Paula" required>' +
            '<em class="nlf-erro">Digite seu nome.</em></label>' +
          '<label class="nlf-campo" data-campo="phone"><span>Seu WhatsApp</span>' +
            '<input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="(83) 99999-9999" required>' +
            '<em class="nlf-erro">Digite o número com DDD.</em></label>' +
          '<label class="nlf-campo"><span>Assunto</span>' +
            '<select name="assunto">' + opcoesAssunto(assunto) + '</select></label>' +
          '<input type="hidden" name="utm_source">' +
          '<input type="hidden" name="utm_medium">' +
          '<input type="hidden" name="utm_campaign">' +
          '<input type="hidden" name="utm_term">' +
          '<input type="hidden" name="utm_content">' +
          '<input type="hidden" name="gclid">' +
          '<input type="hidden" name="fbclid">' +
          '<input type="hidden" name="pagina_entrada">' +
          '<input type="hidden" name="pagina_formulario">' +
          '<input type="hidden" name="codigo_origem">' +
          '<button type="submit" class="nlf-enviar">Continuar no WhatsApp →</button>' +
        '</form>' +
        '<p class="nlf-aviso">Ao continuar, você autoriza a Clínica Nivva a falar com você pelo WhatsApp.</p>' +
        '<button type="button" class="nlf-direto">Prefiro ir direto ao WhatsApp</button>' +
      '</div>';

    document.body.appendChild(fundo);

    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    fundo.querySelector('.nlf-fechar').addEventListener('click', fechar);
    fundo.querySelector('.nlf-direto').addEventListener('click', irDireto);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && fundo && fundo.classList.contains('nlf-aberto')) fechar();
    });

    var form = fundo.querySelector('form');
    form.addEventListener('input', function (e) {
      var campo = e.target.closest('.nlf-campo');
      if (campo) campo.classList.remove('nlf-invalido');
    });
    form.addEventListener('submit', enviar);
  }

  function preencherOcultos(form) {
    var origem = lerOrigem();
    var assunto = ASSUNTOS.filter(function (a) { return a.valor === form.assunto.value; })[0] || assuntoDaPagina();
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(function (p) {
      form.elements[p].value = origem[p] || '';
    });
    form.elements.pagina_entrada.value = origem.landing_page || '';
    form.elements.pagina_formulario.value = window.location.pathname;
    form.elements.codigo_origem.value = codigoOrigem(origem, assunto);
    return { origem: origem, assunto: assunto };
  }

  function abrir(link) {
    linkOriginal = link;
    if (!fundo) montar();
    preencherOcultos(fundo.querySelector('form'));
    fundo.style.display = 'flex';
    // forca o navegador a aplicar o estado inicial antes da transicao
    void fundo.offsetWidth;
    fundo.classList.add('nlf-aberto');
    document.documentElement.style.overflow = 'hidden';
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'lead_form_open', pagina: window.location.pathname });
    setTimeout(function () {
      var nome = fundo.querySelector('input[name="name"]');
      if (nome && window.matchMedia('(min-width: 640px)').matches) nome.focus();
    }, 50);
  }

  function fechar() {
    if (!fundo) return;
    fundo.classList.remove('nlf-aberto');
    document.documentElement.style.overflow = '';
    setTimeout(function () { if (fundo) fundo.style.display = 'none'; }, 200);
  }

  function irDireto() {
    var url = linkOriginal ? linkOriginal.getAttribute('href') : linkWhatsApp('Oi, Dra. Milena! Vim pelo blog.');
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'lead_form_skip', pagina: window.location.pathname });
    fechar();
    abrirWhatsApp(url);
  }

  function enviar(e) {
    e.preventDefault();
    var form = e.target;
    var nome = form.elements.name.value.trim();
    var fone = form.elements.phone.value.trim();
    var ok = true;

    if (nome.length < 2) {
      form.querySelector('[data-campo="name"]').classList.add('nlf-invalido');
      ok = false;
    }
    if (!telefoneValido(fone)) {
      form.querySelector('[data-campo="phone"]').classList.add('nlf-invalido');
      ok = false;
    }
    if (!ok) return;

    form.elements.phone.value = telefoneComDDI(fone);
    var dados = preencherOcultos(form);
    var primeiroNome = nome.split(/\s+/)[0];

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'lead_form_submit',
      pagina: window.location.pathname,
      assunto: dados.assunto.valor,
      codigo_origem: form.elements.codigo_origem.value,
      origem: dados.origem
    });
    marcarEnviado();

    // Conversao do Google Ads (tag carregada pelo nivva-tracking.js).
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: 'AW-11286644766/Lt8-CNjHqrYdEJ6Q8oUq',
        transport_type: 'beacon'
      });
    }

    var texto = 'Oi, Dra. Milena! Sou ' + primeiroNome + ' e quero saber sobre ' +
      dados.assunto.valor.toLowerCase() + '. (' + form.elements.codigo_origem.value + ')';
    if (dados.assunto.codigo === 'OU') {
      texto = 'Oi, Dra. Milena! Sou ' + primeiroNome + ' e gostaria de agendar uma consulta. (' + form.elements.codigo_origem.value + ')';
    }

    var botao = form.querySelector('.nlf-enviar');
    botao.textContent = 'Abrindo o WhatsApp…';
    botao.disabled = true;
    setTimeout(function () {
      fechar();
      botao.textContent = 'Continuar no WhatsApp →';
      botao.disabled = false;
    }, CELULAR ? 1200 : 0);
    abrirWhatsAppDepoisDoEnvio(linkWhatsApp(texto));
  }

  // ---- Intercepta os botoes de WhatsApp ------------------------------------

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    if (!link) return;
    if (link.closest('.nlf-fundo')) return;
    if (jaEnviou()) return;
    e.preventDefault();
    abrir(link);
  });
})();
