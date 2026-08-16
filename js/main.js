(function () {
  'use strict';

  // Endpoint que recebe os leads: grava na planilha do Google e avisa a
  // equipe por e-mail. O codigo do receptor esta em integracao/apps-script.gs,
  // com o passo a passo de instalacao. Cole aqui a URL que o Apps Script
  // devolve ao implantar (termina em /exec).
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyRoijKs4MKnrBV2IfSqmZ3b5_qcSVzN8KZyYmSzFcgqklbRzcLCM-jVBZRihlP9v143w/exec';

  const WHATSAPP_NUMERO = '5562998751035';
  const MENSAGENS_WHATSAPP = {
    hero: 'Olá! Vim pela página de energia solar e quero falar com um engenheiro.',
    flutuante: 'Olá! Vim pela página de energia solar e quero falar com um engenheiro.',
    cta_final: 'Olá! Vim pela página de energia solar e quero falar com um engenheiro.',
    lead_pequeno: 'Olá! Vim pela página de energia solar e queria entender qual a melhor opção para o meu perfil.'
  };

  const prefereReducirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function push(evento) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(evento);
  }

  // ---------- UTM ----------
  function capturarUTMs() {
    const params = new URLSearchParams(window.location.search);
    const campos = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const existentes = sessionStorage.getItem('am2_utms');
    if (existentes && !campos.some(c => params.has(c))) return;

    const utms = {};
    campos.forEach(c => { utms[c] = params.get(c) || ''; });
    sessionStorage.setItem('am2_utms', JSON.stringify(utms));
  }

  function obterUTMs() {
    try {
      return JSON.parse(sessionStorage.getItem('am2_utms')) || {
        utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: ''
      };
    } catch (e) {
      return { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' };
    }
  }

  // ---------- Validação de contato ----------
  function emailValido(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  }
  function whatsappValido(v) {
    return (v || '').replace(/\D/g, '').length >= 10;
  }

  // ---------- Lead / webhook ----------
  // Monta o corpo do lead enviado ao webhook. Usado tanto no momento do
  // cálculo (etapa 'calculadora', quando capturamos nome/WhatsApp/e-mail para
  // liberar o resultado) quanto no envio da conta de luz (etapa 'estudo').
  function montarPayloadLead(resultado, contato, extras) {
    extras = extras || {};
    const utms = obterUTMs();
    return {
      nome: (contato && contato.nome) || '',
      whatsapp: (contato && contato.whatsapp) || '',
      email: (contato && contato.email) || '',
      empresa: extras.empresa || '',
      cidade: extras.cidade || '',
      valor_conta: resultado ? resultado.valorConta : null,
      tipo_operacao: resultado ? resultado.tipoOperacao : null,
      tipo_ligacao: resultado ? resultado.tipoLigacao : null,
      potencia_calculada: resultado ? Number(resultado.potenciaKwp.toFixed(2)) : null,
      investimento_estimado: resultado ? Math.round(resultado.investimento) : null,
      economia_calculada: resultado ? Math.round(resultado.economiaMensal) : null,
      payback_anos: resultado ? Number(resultado.paybackAnos.toFixed(1)) : null,
      faixa_lead: resultado ? (resultado.leadPequeno ? 'pequeno' : 'qualificado') : null,
      anexou_conta: !!extras.anexou,
      etapa: extras.etapa || 'calculadora',
      origem: 'lp-energia-solar',
      utm_source: utms.utm_source,
      utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign,
      utm_term: utms.utm_term,
      utm_content: utms.utm_content,
      data_hora: new Date().toISOString()
    };
  }

  function enviarWebhook(payload) {
    return fetch(WEBHOOK_URL, {
      method: 'POST',
      // text/plain de proposito: com application/json o navegador dispara uma
      // requisicao de preflight (OPTIONS), que o Apps Script nao responde, e o
      // envio falha por CORS. Como text/plain, vira requisicao simples e passa.
      // O Apps Script faz JSON.parse do corpo do mesmo jeito.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('Falha no envio');
      return r;
    });
  }

  // Le o arquivo escolhido e devolve em base64, para viajar dentro do JSON.
  var TAMANHO_MAX_ANEXO = 10 * 1024 * 1024; // 10 MB, igual ao que o formulario promete

  function lerArquivoBase64(arquivo) {
    return new Promise(function (resolve, reject) {
      if (arquivo.size > TAMANHO_MAX_ANEXO) {
        reject(new Error('arquivo maior que 10 MB'));
        return;
      }
      var leitor = new FileReader();
      leitor.onload = function () {
        // O resultado vem como data:<tipo>;base64,<conteudo>; mandamos so o conteudo.
        var partes = String(leitor.result).split(',');
        resolve({
          nome: arquivo.name,
          tipo: arquivo.type || 'application/octet-stream',
          conteudo: partes[1] || ''
        });
      };
      leitor.onerror = function () { reject(new Error('falha ao ler o arquivo')); };
      leitor.readAsDataURL(arquivo);
    });
  }

  // ---------- Formatação ----------
  function formatarBRL(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatarBRLSemCentavos(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  // ---------- Máscara de moeda ----------
  function aplicarMascaraMoeda(input) {
    input.addEventListener('input', () => {
      let digitos = input.value.replace(/\D/g, '');
      if (!digitos) {
        input.value = '';
        input.dataset.valorNumerico = '0';
        return;
      }
      const numero = parseInt(digitos, 10) / 100;
      input.value = formatarBRL(numero);
      input.dataset.valorNumerico = String(numero);
    });
  }

  function aplicarMascaraWhatsapp(input) {
    input.addEventListener('input', () => {
      let d = input.value.replace(/\D/g, '').slice(0, 11);
      if (d.length > 6) {
        input.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      } else if (d.length > 2) {
        input.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
      } else {
        input.value = d;
      }
    });
  }

  // ---------- Contagem animada ----------
  function animarNumero(el, valorFinal, formatarFn, duracaoMs) {
    // Sem animação quando o usuário pede movimento reduzido ou quando a aba
    // está em segundo plano (o requestAnimationFrame fica pausado): mostra
    // o valor final direto.
    if (prefereReducirMovimento || document.hidden) {
      el.textContent = formatarFn(valorFinal);
      return;
    }
    const inicio = performance.now();
    let finalizado = false;
    function finalizar() {
      if (!finalizado) { finalizado = true; el.textContent = formatarFn(valorFinal); }
    }
    function passo(agora) {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1);
      const facilitado = 1 - Math.pow(1 - progresso, 3);
      el.textContent = formatarFn(valorFinal * facilitado);
      if (progresso < 1) requestAnimationFrame(passo);
      else finalizar();
    }
    requestAnimationFrame(passo);
    // Rede de segurança: garante o valor final mesmo se o rAF for pausado.
    setTimeout(finalizar, duracaoMs + 250);
  }

  // ---------- WhatsApp ----------
  function abrirWhatsApp(mensagem, origem) {
    push({ event: 'clique_whatsapp', origem });
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank', 'noopener');
  }

  function iniciarBotoesWhatsApp() {
    document.querySelectorAll('[data-whatsapp-origem]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const origem = btn.dataset.whatsappOrigem;
        const mensagem = MENSAGENS_WHATSAPP[origem] || MENSAGENS_WHATSAPP.hero;
        abrirWhatsApp(mensagem, origem);
      });
    });
  }

  // ---------- Rolagem suave ----------
  function iniciarRolagem() {
    document.querySelectorAll('[data-rolar-para]').forEach(btn => {
      btn.addEventListener('click', () => {
        const alvo = document.querySelector(btn.dataset.rolarPara);
        if (alvo) alvo.scrollIntoView({ behavior: prefereReducirMovimento ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  // ---------- Calculadora ----------
  function iniciarCalculadora() {
    const campoConta = document.getElementById('campo-conta');
    const btnCalcular = document.getElementById('btn-calcular');
    const grupoOperacao = document.querySelectorAll('[data-campo="tipoOperacao"]');
    const grupoLigacao = document.querySelectorAll('[data-campo="tipoLigacao"]');

    const campoNome = document.getElementById('campo-nome');
    const campoWhatsapp = document.getElementById('campo-whatsapp');
    const campoEmail = document.getElementById('campo-email');

    const blocoForm = document.getElementById('calculadora-form');
    const blocoLoading = document.getElementById('calculadora-loading');
    const blocoResultado = document.getElementById('calculadora-resultado');

    const estado = { tipoOperacao: null, tipoLigacao: null, resultadoAtual: null, prazoAtual: 60, contato: null };
    let inicioDisparado = false;

    aplicarMascaraWhatsapp(campoWhatsapp);

    function dispararInicio() {
      if (!inicioDisparado) {
        inicioDisparado = true;
        push({ event: 'calculadora_inicio' });
      }
    }

    function validarBotao() {
      const contaOk = parseFloat(campoConta.dataset.valorNumerico || '0') > 0;
      const nomeOk = campoNome.value.trim().length >= 2;
      const whatsOk = whatsappValido(campoWhatsapp.value);
      const emailOk = emailValido(campoEmail.value);
      btnCalcular.disabled = !(contaOk && estado.tipoOperacao && estado.tipoLigacao && nomeOk && whatsOk && emailOk);
    }

    function marcarValidade(input, valido) {
      const linha = input.closest('.form-linha');
      if (linha) linha.classList.toggle('campo-invalido', !valido);
    }

    campoConta.addEventListener('input', () => { dispararInicio(); validarBotao(); });

    campoNome.addEventListener('input', () => { dispararInicio(); validarBotao(); });
    campoNome.addEventListener('blur', () => marcarValidade(campoNome, campoNome.value.trim().length >= 2));
    campoWhatsapp.addEventListener('input', () => { dispararInicio(); validarBotao(); });
    campoWhatsapp.addEventListener('blur', () => marcarValidade(campoWhatsapp, whatsappValido(campoWhatsapp.value)));
    campoEmail.addEventListener('input', () => { dispararInicio(); validarBotao(); });
    campoEmail.addEventListener('blur', () => marcarValidade(campoEmail, emailValido(campoEmail.value)));

    function iniciarGrupo(botoes, campo) {
      botoes.forEach(btn => {
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          dispararInicio();
          botoes.forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          estado[campo] = btn.dataset.valor;
          validarBotao();
        });
      });
    }
    iniciarGrupo(grupoOperacao, 'tipoOperacao');
    iniciarGrupo(grupoLigacao, 'tipoLigacao');

    function preencherResultado(resultado) {
      const potenciaFmt = v => `${v.toFixed(1)} kWp`;
      const anosFmt = v => `${v.toFixed(1)} anos`;

      animarNumero(document.getElementById('valor-economia'), resultado.economiaMensal, formatarBRLSemCentavos, 1200);
      animarNumero(document.getElementById('valor-potencia'), resultado.potenciaKwp, potenciaFmt, 1200);
      animarNumero(document.getElementById('valor-investimento'), resultado.investimento, formatarBRLSemCentavos, 1200);
      animarNumero(document.getElementById('valor-payback'), resultado.paybackAnos, anosFmt, 1200);

      document.getElementById('economia-25-anos').textContent = formatarBRLSemCentavos(resultado.economia25Anos);

      atualizarPrazo(resultado, estado.prazoAtual);
    }

    function atualizarPrazo(resultado, prazo) {
      const dadosPrazo = resultado.parcelasPorPrazo[prazo];
      document.getElementById('impacto-conta-atual').textContent = formatarBRL(resultado.valorConta);
      document.getElementById('impacto-prazo-label').textContent = String(prazo);
      document.getElementById('impacto-parcela').textContent = formatarBRL(dadosPrazo.parcela);

      const diferencaEl = document.getElementById('impacto-diferenca');
      const fraseEl = document.getElementById('impacto-frase');
      diferencaEl.textContent = formatarBRL(Math.abs(dadosPrazo.diferencaCaixa));

      if (dadosPrazo.diferencaCaixa >= 0) {
        fraseEl.textContent = 'A parcela já fica abaixo da conta de luz que você paga hoje. Você economiza desde o primeiro mês e, quando o financiamento termina, a economia passa a ser integral.';
      } else {
        fraseEl.textContent = `A parcela fica ${formatarBRL(Math.abs(dadosPrazo.diferencaCaixa))} acima da sua conta atual nos primeiros ${prazo} meses. Depois disso, a economia é integral por mais de 18 anos.`;
      }
    }

    document.querySelectorAll('.prazo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.prazo-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        estado.prazoAtual = parseInt(btn.dataset.prazo, 10);
        if (estado.resultadoAtual) atualizarPrazo(estado.resultadoAtual, estado.prazoAtual);
      });
    });

    btnCalcular.addEventListener('click', () => {
      if (btnCalcular.disabled) return;
      const valorConta = parseFloat(campoConta.dataset.valorNumerico || '0');

      const contato = {
        nome: campoNome.value.trim(),
        whatsapp: campoWhatsapp.value.trim(),
        email: campoEmail.value.trim()
      };

      blocoForm.classList.add('oculto');
      blocoLoading.classList.remove('oculto');

      setTimeout(() => {
        const resultado = calcularEconomia({
          valorConta,
          tipoOperacao: estado.tipoOperacao,
          tipoLigacao: estado.tipoLigacao
        });

        blocoLoading.classList.add('oculto');

        if (resultado.erro) {
          blocoForm.classList.remove('oculto');
          alertarErroCalculo();
          return;
        }

        estado.resultadoAtual = resultado;
        estado.contato = contato;
        window.__am2ResultadoAtual = resultado;
        window.__am2Contato = contato;
        preencherResultado(resultado);

        blocoResultado.classList.remove('oculto');
        blocoResultado.classList.add('entrada-suave');
        blocoResultado.scrollIntoView({ behavior: prefereReducirMovimento ? 'auto' : 'smooth', block: 'start' });

        push({
          event: 'calculadora_resultado',
          valor_conta: valorConta,
          tipo_operacao: estado.tipoOperacao,
          potencia_kwp: Number(resultado.potenciaKwp.toFixed(2)),
          investimento_estimado: Math.round(resultado.investimento),
          faixa_lead: resultado.leadPequeno ? 'pequeno' : 'qualificado'
        });

        // O lead ja e capturado aqui: a pessoa deixou nome, WhatsApp e e-mail
        // para ver o resultado. Enviamos ao webhook e disparamos a conversao.
        const payloadLead = montarPayloadLead(resultado, contato, { etapa: 'calculadora' });
        enviarWebhook(payloadLead).catch(function () { /* sem bloquear a UI; o dataLayer ainda dispara */ });

        push({
          event: 'lead_enviado',
          valor_conta: valorConta,
          tipo_operacao: estado.tipoOperacao,
          cidade: '',
          anexou_conta: false,
          faixa_lead: resultado.leadPequeno ? 'pequeno' : 'qualificado'
        });

        alternarBlocoCaptura(resultado);
      }, 900);
    });

    function alertarErroCalculo() {
      campoConta.focus();
    }

    function alternarBlocoCaptura(resultado) {
      const capturaSecao = document.getElementById('captura-secao');
      const leadPequenoSecao = document.getElementById('lead-pequeno-secao');
      if (resultado.leadPequeno) {
        capturaSecao.classList.add('oculto');
        leadPequenoSecao.classList.remove('oculto');
      } else {
        leadPequenoSecao.classList.add('oculto');
        capturaSecao.classList.remove('oculto');
      }
    }

    document.getElementById('btn-refazer').addEventListener('click', () => {
      blocoResultado.classList.add('oculto');
      blocoForm.classList.remove('oculto');
      campoConta.value = '';
      campoConta.dataset.valorNumerico = '0';
      estado.tipoOperacao = null;
      estado.tipoLigacao = null;
      grupoOperacao.forEach(b => b.setAttribute('aria-pressed', 'false'));
      grupoLigacao.forEach(b => b.setAttribute('aria-pressed', 'false'));
      validarBotao();
      document.getElementById('calculadora').scrollIntoView({ behavior: prefereReducirMovimento ? 'auto' : 'smooth', block: 'start' });
    });

    aplicarMascaraMoeda(campoConta);
  }

  // ---------- Formulário de estudo (enriquecimento do lead já capturado) ----------
  function iniciarFormularioCaptura() {
    const form = document.getElementById('captura-form');
    if (!form) return;
    const btnEnviar = document.getElementById('btn-enviar-captura');
    const sucessoEl = document.getElementById('captura-sucesso');
    const erroEl = document.getElementById('captura-erro');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando...';

      const anexoInput = document.getElementById('campo-anexo');
      const arquivo = anexoInput && anexoInput.files && anexoInput.files[0];
      const resultado = window.__am2ResultadoAtual;
      const contato = window.__am2Contato || {};

      // Se a pessoa anexou a conta, converte para base64 antes de enviar.
      // Se a leitura falhar (arquivo grande demais, por exemplo), seguimos
      // com o envio sem o anexo: o lead vale mais que o arquivo.
      let anexo = null;
      if (arquivo) {
        try {
          anexo = await lerArquivoBase64(arquivo);
        } catch (e) {
          anexo = null;
        }
      }

      const payload = montarPayloadLead(resultado, contato, {
        empresa: form.empresa.value.trim(),
        cidade: form.cidade.value.trim(),
        anexou: !!anexo,
        etapa: 'estudo'
      });
      if (anexo) payload.anexo = anexo;

      try {
        await enviarWebhook(payload);

        push({
          event: 'conta_enviada',
          cidade: payload.cidade,
          anexou_conta: !!anexo
        });

        form.classList.add('oculto');
        erroEl.classList.add('oculto');
        sucessoEl.classList.remove('oculto');
      } catch (erro) {
        erroEl.classList.remove('oculto');
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar minha conta para o estudo';
      }
    });
  }

  // ---------- FAQ ----------
  function iniciarFAQ() {
    document.querySelectorAll('.faq-pergunta').forEach(btn => {
      const resposta = document.getElementById(btn.getAttribute('aria-controls'));
      function abrir() {
        btn.setAttribute('aria-expanded', 'true');
        resposta.style.maxHeight = resposta.scrollHeight + 'px';
      }
      function fechar() {
        btn.setAttribute('aria-expanded', 'false');
        resposta.style.maxHeight = '0';
      }
      if (btn.getAttribute('aria-expanded') === 'true') abrir();

      btn.addEventListener('click', () => {
        const aberto = btn.getAttribute('aria-expanded') === 'true';
        if (aberto) {
          fechar();
        } else {
          document.querySelectorAll('.faq-pergunta').forEach(outro => {
            if (outro !== btn) {
              outro.setAttribute('aria-expanded', 'false');
              document.getElementById(outro.getAttribute('aria-controls')).style.maxHeight = '0';
            }
          });
          abrir();
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    capturarUTMs();
    iniciarBotoesWhatsApp();
    iniciarRolagem();
    iniciarCalculadora();
    iniciarFormularioCaptura();
    iniciarFAQ();
  });
})();
