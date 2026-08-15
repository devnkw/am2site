const CONFIG = {
  // ============================================
  // CALIBRAR COM DADOS REAIS ANTES DE PUBLICAR
  // ============================================

  // Tarifas da Equatorial Goias em R$/kWh, com impostos, bandeira verde
  tarifa: {
    comercio:   0.92,   // Grupo B3. CALIBRAR com fatura real
    industria:  0.92,   // Grupo B3. CALIBRAR
    rural:      0.68,   // Grupo B2. CALIBRAR
    condominio: 0.92    // Grupo B3. CALIBRAR
  },

  // Geracao media em kWh por kWp instalado por mes, em Goias
  // Irradiacao de Goiania fica entre 5,3 e 5,55 kWh/m2/dia
  // Valor conservador proposital: prometer menos, entregar mais
  geracaoPorKwpMes: 130,

  // Custo de disponibilidade em kWh, regra ANEEL
  custoDisponibilidade: {
    monofasica: 30,
    bifasica:   50,
    trifasica:  100,
    naoSei:     100   // assume trifasica, perfil mais comum em empresa
  },

  // Fio B
  fioB: {
    valorCheioPorKwh: 0.1233,  // CALIBRAR com a tarifa homologada da Equatorial GO
    percentualVigente: 0.60    // 2026. Sobe para 0.75 em 2027 e 0.90 em 2028
  },

  // Autoconsumo simultaneo por perfil de operacao
  // Percentual da geracao consumido no mesmo instante, sem passar pela rede
  // Quanto maior, menor o impacto do Fio B
  autoconsumo: {
    comercio:   0.55,
    industria:  0.70,
    rural:      0.50,
    condominio: 0.40
  },

  // Custo por kWp instalado, por faixa de potencia
  // Ganho de escala em sistemas maiores
  custoPorKwp: [
    { ate: 10,       valor: 5800 },
    { ate: 30,       valor: 4900 },
    { ate: 75,       valor: 4300 },
    { ate: Infinity, valor: 3900 }
  ],

  // Financiamento
  financiamento: {
    taxaMensal: 0.0120,          // 1,20% ao mes. CALIBRAR com parceiro da AM2
    prazos: [60, 84, 120]
  },

  // Projecao de longo prazo
  projecao: {
    reajusteTarifaAnual: 0.08,   // 8% ao ano, media historica em Goias
    degradacaoPainelAnual: 0.005,
    horizonteAnos: 25
  },

  // Contribuicao de iluminacao publica, valor fixo mensal estimado
  iluminacaoPublica: 45.00,      // CALIBRAR

  // Regras de qualificacao de lead
  qualificacao: {
    contaMinimaFormulario: 800,  // abaixo disso, rota WhatsApp
    contaAlvo: 2000              // perfil ideal declarado no posicionamento
  }
};

function obterCustoPorKwp(potenciaKwp) {
  const faixa = CONFIG.custoPorKwp.find(f => potenciaKwp <= f.ate);
  return faixa.valor;
}

function calcularPMT(principal, taxaMensal, meses) {
  if (taxaMensal === 0) return principal / meses;
  const fator = Math.pow(1 + taxaMensal, meses);
  return principal * (taxaMensal * fator) / (fator - 1);
}

// entrada: { valorConta, tipoOperacao, tipoLigacao }
// saida: objeto com todos os indicadores, ou { erro: 'perfil_inadequado' }
function calcularEconomia(entrada) {
  const { valorConta, tipoOperacao, tipoLigacao } = entrada;

  const tarifa = CONFIG.tarifa[tipoOperacao];
  const consumoKwh = valorConta / tarifa;

  const custoDisponibilidadeKwh = CONFIG.custoDisponibilidade[tipoLigacao];
  const consumoCompensavel = consumoKwh - custoDisponibilidadeKwh;

  if (consumoCompensavel <= 0) {
    return { erro: 'perfil_inadequado' };
  }

  const potenciaKwp = consumoKwh / CONFIG.geracaoPorKwpMes;

  const custoKwp = obterCustoPorKwp(potenciaKwp);
  const investimento = potenciaKwp * custoKwp;

  const geracaoMensal = potenciaKwp * CONFIG.geracaoPorKwpMes;
  const autoconsumoPerc = CONFIG.autoconsumo[tipoOperacao];
  const kwhAutoconsumido = geracaoMensal * autoconsumoPerc;
  const kwhInjetado = geracaoMensal - kwhAutoconsumido;

  const economiaAutoconsumo = kwhAutoconsumido * tarifa;

  const custoFioB = kwhInjetado * CONFIG.fioB.valorCheioPorKwh * CONFIG.fioB.percentualVigente;
  const economiaInjetada = (kwhInjetado * tarifa) - custoFioB;

  let economiaMensal = economiaAutoconsumo + economiaInjetada;

  const minimoPermanente = (custoDisponibilidadeKwh * tarifa) + CONFIG.iluminacaoPublica;
  economiaMensal = Math.min(economiaMensal, valorConta - minimoPermanente);
  economiaMensal = Math.max(economiaMensal, 0);

  const contaResidual = valorConta - economiaMensal;
  const paybackAnos = investimento / (economiaMensal * 12);

  let economia25Anos = 0;
  for (let ano = 1; ano <= CONFIG.projecao.horizonteAnos; ano++) {
    economia25Anos += economiaMensal * 12
      * Math.pow(1 + CONFIG.projecao.reajusteTarifaAnual, ano)
      * Math.pow(1 - CONFIG.projecao.degradacaoPainelAnual, ano);
  }

  const parcelasPorPrazo = {};
  CONFIG.financiamento.prazos.forEach(prazo => {
    const parcela = calcularPMT(investimento, CONFIG.financiamento.taxaMensal, prazo);
    parcelasPorPrazo[prazo] = {
      parcela,
      // Diferenca no caixa = quanto a parcela fica abaixo (ou acima) da conta
      // de luz atual. Positivo = a parcela e menor que a conta de hoje, entao
      // a empresa passa a gastar menos ja no primeiro mes (troca a conta pela
      // parcela). Bate com as duas linhas exibidas: conta atual e parcela.
      diferencaCaixa: valorConta - parcela
    };
  });

  return {
    valorConta,
    tipoOperacao,
    tipoLigacao,
    consumoKwh,
    potenciaKwp,
    investimento,
    economiaMensal,
    contaResidual,
    paybackAnos,
    economia25Anos,
    parcelasPorPrazo,
    leadPequeno: valorConta < CONFIG.qualificacao.contaMinimaFormulario
  };
}
