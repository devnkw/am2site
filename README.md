# Landing Page — Energia Solar B2B — AM2 Engenharia

Landing page de conversão para tráfego pago (Google Ads / Meta Ads), focada em
empresas com conta de luz acima de R$ 2.000/mês em Goiânia e interior de Goiás.
HTML5, CSS3 e JavaScript vanilla, sem build, pronta para deploy via Git na Hostinger.

## Estrutura

```
/
├── index.html          página única, toda a copy do brief já aplicada
├── css/style.css        sistema de tokens, tipografia, grid, seções
├── js/calculadora.js    CONFIG + lógica de cálculo (pura, sem DOM)
├── js/main.js            interface: máscaras, UTM, formulário, GTM, FAQ
├── img/                  fotos reais de projetos (WebP) + logo + og-image
└── robots.txt
```

## Antes de publicar: o que precisa ser calibrado

### 1. `js/calculadora.js` — objeto `CONFIG`

Todos os parâmetros do cálculo ficam nesse objeto, no topo do arquivo, com
comentários indicando o que é estimativa e o que precisa de dado real:

- `tarifa` — tarifa em R$/kWh por tipo de operação. Hoje usa valores
  aproximados da Equatorial Goiás (grupo B, bandeira verde). Substituir pelos
  valores da tarifa homologada vigente.
- `fioB.valorCheioPorKwh` — valor do Fio B por kWh. Calibrar com a tarifa
  homologada da Equatorial GO.
- `iluminacaoPublica` — hoje fixo em R$ 45,00. Ajustar para a média real
  cobrada pelo município predominante nos leads.
- `custoPorKwp` — custo por kWp instalado, por faixa de potência. Reflete o
  custo médio de mercado; ajustar com o custo real de fechamento da AM2.
- `financiamento.taxaMensal` — taxa de juros mensal usada para calcular a
  parcela (fórmula PMT). Calibrar com o parceiro financeiro da AM2.
- `projecao.reajusteTarifaAnual` — reajuste médio histórico da tarifa em
  Goiás, usado na projeção de 25 anos. Hoje em 8% ao ano.
- `qualificacao.contaMinimaFormulario` — abaixo desse valor de conta, a
  página mostra a rota alternativa de WhatsApp em vez do formulário de
  captura. Hoje em R$ 800.

Nenhuma outra parte do código precisa ser tocada para recalibrar os números:
o cálculo inteiro depende apenas desse objeto.

### 2. `js/main.js` — endpoint do webhook

No topo do arquivo:

```javascript
const WEBHOOK_URL = 'COLAR_URL_DO_WEBHOOK_MAKE_AQUI';
```

Colar a URL do cenário do Make (ou outro endpoint) que recebe o lead via
`POST` com corpo em JSON.

O número de WhatsApp e as mensagens pré-preenchidas por origem também ficam
no topo desse arquivo, nas constantes `WHATSAPP_NUMERO` e
`MENSAGENS_WHATSAPP`.

### Fluxo de captura do lead (importante)

A calculadora captura o lead ANTES de mostrar o resultado: a pessoa preenche
o valor da conta, o tipo de operação, o tipo de ligação e também nome,
WhatsApp e e-mail. Só com esses dados o botão "Ver meu resultado" habilita.
Ao calcular, o lead é enviado ao webhook (com `etapa: "calculadora"`) e o
resultado aparece. Assim todo mundo que vê o resultado já é um lead.

Depois do resultado, um segundo formulário (opcional) permite anexar a conta
de luz e informar empresa/cidade para adiantar o estudo de viabilidade. Esse
envio dispara um segundo POST ao mesmo webhook, agora com `etapa: "estudo"`.
Os dois envios trazem o mesmo `email`, o que permite juntar os registros no
Make. Contas abaixo de R$ 800 (`contaMinimaFormulario`) continuam vendo o
resultado, mas no lugar do formulário de estudo aparece a rota de WhatsApp —
o lead já foi capturado no cálculo mesmo assim.

Observação: o arquivo em si nunca é enviado no JSON (só o sinalizador
`anexou_conta: true/false`). A conta de luz chega à AM2 pelo WhatsApp/contato.

### 3. Google Tag Manager e Meta Pixel

O contêiner `GTM-5PCXXTLG` já está instalado (mesmo do site institucional).
O Pixel da Meta deve ser instalado dentro do próprio GTM, mapeando o evento
`lead_enviado` do dataLayer para o evento padrão `Lead`. Não hardcodear o
pixel no HTML.

Eventos disparados no dataLayer: `calculadora_inicio`, `calculadora_resultado`,
`lead_enviado` (agora no momento do cálculo, quando os dados de contato são
capturados), `conta_enviada` (envio opcional da conta de luz) e
`clique_whatsapp`. Configurar `lead_enviado` como conversão principal no
Google Ads e `calculadora_resultado` (com `faixa_lead: qualificado`) como
microconversão para otimização de campanha.

### 4. Condições de pagamento a confirmar com o André

A seção "Trocar de despesa para ativo cabe no seu caixa" traz os bullets de
financiamento inspirados na referência de mercado (parcela em até 84x, até 4
cartões, financiamento de 100%, carência inicial). Esses termos precisam ser
confirmados com o parceiro financeiro antes de publicar. O texto está no bloco
`<!-- 05B. CONDIÇÕES DE PAGAMENTO -->` do `index.html`. Ajuste os prazos e
percentuais conforme o que a AM2 realmente oferece hoje.

### 5. Avaliações do Google

A seção de avaliações usa três depoimentos reais e públicos do perfil do Google
Meu Negócio da AM2 (nota 5,0 em 56 avaliações, em 2026-08-15), com o texto
transcrito literalmente. O botão "Ver todas as avaliações" aponta para a busca
do perfil no Google Maps. Se quiser trocar por outros depoimentos ou atualizar a
contagem de avaliações, edite o bloco `<!-- 07B. AVALIAÇÕES GOOGLE -->`. Não
inventar avaliações: usar apenas texto real do perfil.

## Paleta de cores

Extraída do site institucional (`am2engenharia.com`) em 2026-08-10, a partir
do `logo.svg` e do `css/style.css` publicados. Documentação completa no topo
de `css/style.css`. Resumo:

- `--am2-ambar` `#F6B414` — cor de marca dominante e única cor de ação da
  página (botões, números de destaque, resultado da calculadora).
- `--am2-grafite` `#232323` e `--am2-grafite-2` `#545150` — cores
  institucionais de texto e fundo escuro, extraídas do CSS do site.
- Não existe um verde institucional próprio da AM2 no site atual (o único
  verde encontrado é o verde padrão do botão do WhatsApp). Por isso as
  seções de fundo escuro desta página usam grafite profundo em vez de
  verde.

## Imagens

As quatro fotos de projeto (`img/projeto-*.webp`) são fotos reais dos
sistemas instalados pela AM2 (Conágua Ambiental, Colégio Anglo, Martins
Distribuição e Laticínios Carvalho), baixadas do site institucional e
recomprimidas em WebP. Nenhuma foto de banco de imagens foi usada.

A faixa de clientes ("Também assinamos projetos elétricos para...") usa
nomes em texto (wordmarks tipográficos), não logos em imagem, para manter o
peso da página dentro do orçamento de performance.

## Deploy (Hostinger via Git)

1. Repositório conectado em hPanel > Websites > Dashboard > Advanced > Git.
2. Root directory de deploy: `public_html/energia-solar`.
3. Branch de auto-deploy: `main`.
4. `index.html` já está na raiz do repositório e todos os caminhos de asset
   são relativos — nenhum ajuste de caminho é necessário após o deploy.

## Checklist antes de ativar a campanha

- [ ] `CONFIG` calibrado com tarifa real, custo por kWp real e taxa de
      financiamento real
- [ ] `WEBHOOK_URL` preenchida e testada (lead de teste chegando no Make)
- [ ] Eventos do dataLayer verificados no modo de visualização do GTM
- [ ] Pixel da Meta mapeado ao evento `lead_enviado`
- [ ] Teste da calculadora em pelo menos 5 cenários, incluindo os extremos
      (conta abaixo de R$ 800 e conta muito alta)
