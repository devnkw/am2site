/**
 * AM2 ENGENHARIA — RECEPTOR DE LEADS DA LANDING PAGE
 * =================================================
 *
 * Recebe os leads da landing page de energia solar, grava uma linha na
 * planilha e avisa a equipe por e-mail.
 *
 * COMO INSTALAR (leva uns 3 minutos, e so precisa ser feito uma vez):
 *
 *  1. Abra a planilha de leads no Google Sheets.
 *  2. Menu  Extensoes > Apps Script.
 *  3. Apague o conteudo do arquivo que abrir e cole TODO este arquivo.
 *  4. Clique em Salvar (icone de disquete).
 *  5. Clique em  Implantar > Nova implantacao.
 *  6. Na engrenagem, escolha o tipo  Aplicativo da Web.
 *  7. Preencha:
 *        Executar como:         Eu  (a sua conta Google)
 *        Quem pode acessar:     Qualquer pessoa
 *     ATENCAO: precisa ser "Qualquer pessoa", e nao "Qualquer pessoa com
 *     conta do Google". Sem isso o site nao consegue enviar o lead.
 *  8. Clique em Implantar. O Google vai pedir autorizacao: aceite
 *     (ele avisa que o script nao e verificado, e normal por ser um script
 *     seu; clique em Avancado > Acessar projeto).
 *  9. Copie a URL que aparece (termina em  /exec ).
 * 10. Cole essa URL no arquivo  js/main.js  da landing page, na constante
 *     WEBHOOK_URL, no lugar de COLAR_URL_DO_WEBHOOK_MAKE_AQUI.
 *
 * DEPOIS DE QUALQUER ALTERACAO NESTE SCRIPT: use  Implantar > Gerenciar
 * implantacoes > (lapis) > Versao: Nova versao > Implantar. Se voce criar
 * uma implantacao nova do zero, a URL muda e precisa ser trocada no site.
 */

// ============================================
// CONFIGURACAO
// ============================================

// Planilha de leads. Se um dia trocar de planilha, e so trocar este ID
// (ele fica na URL da planilha, entre  /d/  e  /edit ).
var PLANILHA_ID = '11w5GmMf4z9uwxnU9bxrKlvxiwNOIPDSpE3LAVc6-YfE';

// Para quem vai o aviso de lead novo. Pode colocar mais de um e-mail
// separando por virgula: 'projetos@am2engenharia.com,comercial@...'
var EMAIL_DESTINO = 'projetos@am2engenharia.com';

// Nome do servico, usado na coluna "servico" da planilha. As outras duas
// landing pages (Projetos e Laudos) vao usar o mesmo script com um valor
// diferente aqui, para tudo cair na mesma planilha ja separado.
var SERVICO = 'Energia Solar';

// Pasta do Drive onde as contas de luz anexadas sao guardadas.
// Deixe em branco para salvar na raiz do Drive.
var PASTA_DRIVE_ID = '';

// ============================================
// TRADUCAO DOS CODIGOS PARA TEXTO LEGIVEL
// ============================================

var ROTULO_OPERACAO = {
  comercio: 'Comercio ou servico',
  industria: 'Industria',
  rural: 'Rural ou agro',
  condominio: 'Condominio'
};

var ROTULO_LIGACAO = {
  monofasica: 'Monofasica',
  bifasica: 'Bifasica',
  trifasica: 'Trifasica',
  naoSei: 'Nao sei'
};

// ============================================
// ENTRADA
// ============================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, erro: 'Requisicao sem corpo' });
    }

    var d = JSON.parse(e.postData.contents);

    // O site envia o lead em dois momentos:
    //   etapa 'calculadora' -> a pessoa deixou os dados para ver o resultado.
    //                          E aqui que o lead nasce, entao gravamos a linha.
    //   etapa 'estudo'      -> a mesma pessoa mandou a conta de luz depois.
    //                          Nao gravamos linha nova para nao duplicar o
    //                          lead: so avisamos a equipe por e-mail.
    var etapa = d.etapa || 'calculadora';

    if (etapa === 'calculadora') {
      gravarNaPlanilha(d);
      enviarEmailLeadNovo(d);
    } else {
      enviarEmailContaRecebida(d);
    }

    return responder({ ok: true });

  } catch (err) {
    // Registra no log do Apps Script (Execucoes) para facilitar o diagnostico
    // e ainda tenta avisar por e-mail, para nenhum lead se perder calado.
    console.error('Falha ao processar lead: ' + err.message + ' | corpo: ' +
      (e && e.postData ? e.postData.contents : 'vazio'));
    try {
      MailApp.sendEmail(EMAIL_DESTINO,
        '[AM2] Falha ao registrar um lead',
        'Um lead chegou mas nao foi possivel processar.\n\n' +
        'Erro: ' + err.message + '\n\n' +
        'Dados recebidos:\n' + (e && e.postData ? e.postData.contents : 'vazio'));
    } catch (err2) {}
    return responder({ ok: false, erro: err.message });
  }
}

// Responde a chamadas GET, util so para testar no navegador se a
// implantacao esta no ar.
function doGet() {
  return responder({ ok: true, status: 'Receptor de leads da AM2 no ar' });
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// PLANILHA
// ============================================

function gravarNaPlanilha(d) {
  var aba = SpreadsheetApp.openById(PLANILHA_ID).getSheets()[0];

  // A ordem abaixo segue exatamente as colunas da planilha:
  // Nome | Telefone | email | servico | valor conta de luz |
  // tipo de operacao | tipo de ligacao
  aba.appendRow([
    d.nome || '',
    d.whatsapp || '',
    d.email || '',
    SERVICO,
    d.valor_conta != null ? Number(d.valor_conta) : '',
    ROTULO_OPERACAO[d.tipo_operacao] || d.tipo_operacao || '',
    ROTULO_LIGACAO[d.tipo_ligacao] || d.tipo_ligacao || ''
  ]);
}

// ============================================
// E-MAILS
// ============================================

function enviarEmailLeadNovo(d) {
  var assunto = 'Novo lead: ' + (d.nome || 'sem nome') +
    ' — conta de ' + moeda(d.valor_conta);

  MailApp.sendEmail({
    to: EMAIL_DESTINO,
    subject: assunto,
    htmlBody: montarHtml('Novo lead da landing page de energia solar', d)
  });
}

function enviarEmailContaRecebida(d) {
  var anexos = [];
  var avisoAnexo = 'Nenhum arquivo anexado.';

  if (d.anexo && d.anexo.conteudo) {
    try {
      var arquivo = salvarAnexoNoDrive(d);
      anexos.push(arquivo.getAs(d.anexo.tipo || 'application/octet-stream'));
      avisoAnexo = 'Arquivo tambem salvo no Drive: ' + arquivo.getUrl();
    } catch (err) {
      avisoAnexo = 'Houve um erro ao salvar o anexo: ' + err.message;
    }
  }

  MailApp.sendEmail({
    to: EMAIL_DESTINO,
    subject: 'Conta de luz recebida: ' + (d.nome || 'sem nome'),
    htmlBody: montarHtml('Este lead enviou a conta de luz para o estudo', d) +
      '<p style="color:#6B7280;font-size:13px">' + escapar(avisoAnexo) + '</p>',
    attachments: anexos
  });
}

function salvarAnexoNoDrive(d) {
  var blob = Utilities.newBlob(
    Utilities.base64Decode(d.anexo.conteudo),
    d.anexo.tipo || 'application/octet-stream',
    montarNomeArquivo(d)
  );
  if (PASTA_DRIVE_ID) {
    return DriveApp.getFolderById(PASTA_DRIVE_ID).createFile(blob);
  }
  return DriveApp.createFile(blob);
}

function montarNomeArquivo(d) {
  var nome = (d.nome || 'lead').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  var original = d.anexo.nome || 'conta-de-luz';
  return 'conta-' + nome + '-' + original;
}

function montarHtml(titulo, d) {
  var linhas = [
    ['Nome', d.nome],
    ['WhatsApp', d.whatsapp],
    ['E-mail', d.email],
    ['Empresa', d.empresa],
    ['Cidade', d.cidade],
    ['Conta de luz hoje', moeda(d.valor_conta)],
    ['Tipo de operacao', ROTULO_OPERACAO[d.tipo_operacao] || d.tipo_operacao],
    ['Tipo de ligacao', ROTULO_LIGACAO[d.tipo_ligacao] || d.tipo_ligacao],
    ['Perfil', d.faixa_lead === 'pequeno' ? 'Abaixo do perfil alvo' : 'Qualificado'],
    ['Sistema calculado', d.potencia_calculada ? d.potencia_calculada + ' kWp' : ''],
    ['Investimento estimado', moeda(d.investimento_estimado)],
    ['Economia estimada por mes', moeda(d.economia_calculada)],
    ['Retorno estimado', d.payback_anos ? d.payback_anos + ' anos' : ''],
    ['Origem', d.utm_source || 'acesso direto'],
    ['Campanha', d.utm_campaign],
    ['Termo de busca', d.utm_term],
    ['Anuncio', d.utm_content]
  ];

  var tabela = linhas
    .filter(function (l) { return l[1] !== '' && l[1] != null; })
    .map(function (l) {
      return '<tr>' +
        '<td style="padding:6px 14px 6px 0;color:#6B7280;white-space:nowrap">' + escapar(l[0]) + '</td>' +
        '<td style="padding:6px 0;font-weight:600">' + escapar(String(l[1])) + '</td>' +
        '</tr>';
    })
    .join('');

  var wa = (d.whatsapp || '').replace(/\D/g, '');
  var botao = wa
    ? '<p><a href="https://wa.me/55' + wa + '" ' +
      'style="display:inline-block;background:#F6B414;color:#232323;' +
      'font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">' +
      'Chamar no WhatsApp</a></p>'
    : '';

  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#232323;max-width:560px">' +
    '<h2 style="margin:0 0 4px">' + escapar(titulo) + '</h2>' +
    '<p style="color:#6B7280;margin:0 0 18px">Recebido em ' + agora() + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' + tabela + '</table>' +
    botao +
    '</div>';
}

// ============================================
// AUXILIARES
// ============================================

function moeda(valor) {
  if (valor == null || valor === '') return '';
  return 'R$ ' + Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function agora() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Teste manual: rode esta funcao pelo proprio editor do Apps Script
 * (selecione  testarLead  na lista e clique em Executar) para conferir se a
 * planilha recebe a linha e se o e-mail chega, sem precisar do site.
 */
function testarLead() {
  gravarNaPlanilha({
    nome: 'Lead de teste',
    whatsapp: '(62) 99999-9999',
    email: 'teste@exemplo.com',
    valor_conta: 3500,
    tipo_operacao: 'industria',
    tipo_ligacao: 'trifasica'
  });
  enviarEmailLeadNovo({
    nome: 'Lead de teste',
    whatsapp: '(62) 99999-9999',
    email: 'teste@exemplo.com',
    empresa: 'Empresa Teste',
    cidade: 'Goiania',
    valor_conta: 3500,
    tipo_operacao: 'industria',
    tipo_ligacao: 'trifasica',
    faixa_lead: 'qualificado',
    potencia_calculada: 29.26,
    investimento_estimado: 143395,
    economia_calculada: 3100,
    payback_anos: 3.9,
    utm_source: 'teste'
  });
}
