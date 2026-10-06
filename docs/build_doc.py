# Gera docs/Transmission-Portal-Documentacao.pdf (python docs/build_doc.py; requer reportlab)
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Preformatted, PageBreak, KeepTogether, CondPageBreak)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Transmission-Portal-Documentacao.pdf')
ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Heading1'], fontName='Helvetica-Bold', fontSize=15, spaceBefore=10, spaceAfter=6)
H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=11.5, spaceBefore=8, spaceAfter=4)
P = ParagraphStyle('P', parent=ss['BodyText'], fontName='Helvetica', fontSize=9.5, leading=13.5, spaceAfter=5)
LI = ParagraphStyle('LI', parent=P, leftIndent=12, bulletIndent=2, spaceAfter=2)
SM = ParagraphStyle('SM', parent=P, fontSize=8.5, leading=11.5, textColor=colors.HexColor('#555555'))
CODE = ParagraphStyle('CODE', fontName='Courier', fontSize=8.2, leading=10.8, backColor=colors.HexColor('#f3f3f3'),
                      borderPadding=5, leftIndent=4, rightIndent=4, spaceBefore=3, spaceAfter=8)
TC = ParagraphStyle('TC', parent=P, fontSize=8.5, leading=11, spaceAfter=0)

def p(t): return Paragraph(t, P)
def li(items): return [Paragraph(i, LI, bulletText='•') for i in items]
def code(t): return KeepTogether([Preformatted(t.strip('\n'), CODE)])
def table(rows, widths):
    data = [[Paragraph(str(c), TC) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bbbbbb')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return t

def footer(c, d):
    c.saveState()
    c.setFont('Helvetica', 7.5); c.setFillColor(colors.HexColor('#777777'))
    c.drawString(18 * mm, 10 * mm, 'Transmission Portal — Documentação técnica')
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, 'Página %d' % d.page)
    c.restoreState()

W = A4[0] - 36 * mm
s = []

# ── Capa simples ──
s += [Spacer(1, 40 * mm),
      Paragraph('Transmission Portal', ParagraphStyle('T', fontName='Helvetica-Bold', fontSize=24, leading=28)),
      Spacer(1, 4), Paragraph('Documentação técnica e guia de implantação', ParagraphStyle('S', fontName='Helvetica', fontSize=13, textColor=colors.HexColor('#444444'))),
      Spacer(1, 18),
      p('Network Engineering — Transmission · Tely'),
      p('Autor: Antony Araújo · Versão: outubro/2026'),
      p('Repositório: github.com/antonyllz/transmission-portal (branch main)'),
      Spacer(1, 16),
      p('<b>Conteúdo</b>'),
      *li(['1. Visão geral', '2. Arquitetura', '3. Estrutura de arquivos', '4. Dados e API',
           '5. Páginas e funcionalidades', '6. Integração com o Zabbix', '7. Dashboard Amazon Leo',
           '8. Instalação com Docker', '9. Migração da VPS atual', '10. Operação e manutenção',
           '11. Segurança e observações']),
      PageBreak()]

# ── 1 ──
s += [CondPageBreak(60 * mm), Paragraph('1. Visão geral', H1),
      p('O Transmission Portal é o portal interno do time de Network Engineering — Transmission. Reúne ferramentas do '
        'dia a dia: quadro de demandas, controle de RMAs, mapa DWDM com os lambdas em uso, catálogo do almoxarifado, '
        'geradores de LOA e RFO, timeline de casos e a dashboard dos circuitos da Amazon Leo alimentada pelo Zabbix.'),
      p('É uma aplicação web leve: front-end em HTML/CSS/JavaScript puro e um back-end em Node.js <b>sem nenhuma '
        'dependência externa</b> (não usa npm install). Os dados ficam em arquivos JSON. Todos os usuários veem os mesmos dados.')]

# ── 2 ──
s += [CondPageBreak(60 * mm), Paragraph('2. Arquitetura', H1),
      p('São dois processos Node.js:'),
      table([['Processo', 'Arquivo', 'Porta', 'Função'],
             ['Servidor público', 'server/public-server.js', '5454 (0.0.0.0)', 'Serve os arquivos estáticos do site e repassa as chamadas /api/* para a API interna.'],
             ['API de dados', 'server/server.js', '5455 (127.0.0.1)', 'Lê e grava as coleções JSON em server/data/, recebe o webhook do Zabbix e entrega o feed da dashboard.']],
            [32 * mm, 40 * mm, 27 * mm, W - 99 * mm]),
      Spacer(1, 6),
      code('Navegador --(http :5454)--> public-server.js\n'
           '                                  |  /api/*\n'
           '                                  v\n'
           'Zabbix ---(POST /api/zabbix/webhook + token)---> server.js (127.0.0.1:5455)\n'
           '                                                  |\n'
           '                                                  v\n'
           '                                           server/data/*.json'),
      p('O navegador mantém uma cópia local (localStorage) para abrir rápido e sincroniza com o servidor a cada 8 segundos. '
        'A gravação é feita substituindo a coleção inteira (PUT); a última gravação vence. '
        'A navegação usa endereços com # (ex.: <font face="Courier">#/rmas</font>), então voltar/avançar do navegador e links compartilhados funcionam.'),
      p('Bibliotecas carregadas por CDN no navegador (precisam de acesso à internet a partir do PC do usuário): Leaflet (mapa), '
        'leaflet-polylineoffset, SheetJS (só ao importar planilha), fontes Inter (Google Fonts) e tiles do OpenStreetMap.')]

# ── 3 ──
s += [CondPageBreak(60 * mm), Paragraph('3. Estrutura de arquivos', H1),
      table([['Caminho', 'Conteúdo'],
             ['index.html', 'Página única com todas as telas do portal.'],
             ['assets/css/*.css', 'Estilos: base, home, demandas, RMAs, lambdas, almoxarifado, dashboard Amazon Leo, tema escuro (profile.css).'],
             ['assets/js/app.js', 'Inicialização e atualização periódica das telas.'],
             ['assets/js/database.js', 'Cache local + sincronização com a API (GET/PUT).'],
             ['assets/js/navigation.js', 'Navegação e rotas (#/...). Toda página nova precisa entrar em PAGE_ROUTES e ROUTE_OPENERS.'],
             ['assets/js/home.js', 'Animações da home (malha óptica do topo, cards).'],
             ['assets/js/demands.js', 'Painel de demandas.'],
             ['assets/js/rma.js', 'RMAs.'],
             ['assets/js/lambdas.js, osa.js', 'Mapa DWDM, canais, espectro (OSA).'],
             ['assets/js/network-data.js', 'Topologia DWDM fixa: sites (coordenadas, função ROADM/Terminal/OLA) e trechos.'],
             ['assets/js/network-routes.js', 'Traçado dos trechos pelas rodovias (gerado por tools/build-routes.js).'],
             ['assets/js/alm.js', 'Almoxarifado (busca de itens e importação da planilha).'],
             ['assets/js/leo-dash.js', 'Dashboard Amazon Leo.'],
             ['assets/js/timeline.js', 'Case Timeline (Amazon Leo).'],
             ['loa/, rfo/, rfo-generic/', 'Geradores de LOA e RFO (páginas independentes abertas dentro do portal).'],
             ['server/server.js', 'API de dados.'],
             ['server/public-server.js', 'Servidor público (estático + proxy da API).'],
             ['server/zabbix.js', 'Webhook do Zabbix, métricas Rx e feed da dashboard.'],
             ['server/data/', 'Dados (JSON) e token do Zabbix. NÃO vai para o Git.'],
             ['tools/build-routes.js', 'Recalcula o traçado rodoviário dos trechos (OSRM).'],
             ['Dockerfile, docker-compose.yml, docker/start.js', 'Empacotamento em container.'],
             ['ecosystem.config.js', 'Configuração do PM2 (usada na VPS atual, não é necessária no Docker).']],
            [55 * mm, W - 55 * mm])]

# ── 4 ──
s += [CondPageBreak(60 * mm), Paragraph('4. Dados e API', H1),
      p('Cada coleção é um arquivo JSON em <font face="Courier">server/data/</font> contendo uma lista. A gravação é atômica '
        '(arquivo temporário + rename).'),
      table([['Coleção', 'Arquivo', 'Conteúdo'],
             ['cases', 'cases.json', 'Casos do Case Timeline.'],
             ['demands', 'demands.json', 'Demandas da home (prioridade, prazo, comentários).'],
             ['rmas', 'rmas.json', 'RMAs.'],
             ['lambdas', 'lambdas.json', 'Canais DWDM (frequência, grid, cliente, pontas, rota).'],
             ['netpos', 'netpos.json', 'Ajustes de posição/função de sites feitos no mapa.'],
             ['itens / itensmeta', 'itens.json / itensmeta.json', 'Catálogo do almoxarifado e dados da última importação.'],
             ['leoalarms', 'leoalarms.json', 'Eventos do Zabbix (Amazon Leo), até 3.000 mais recentes.'],
             ['leozbxmeta', 'leozbxmeta.json', 'Controle da integração (primeiro/último evento).'],
             ['leometrics', 'leometrics.json', 'Potência Rx por circuito (último valor + 24 h).'],
             ['—', 'zabbix-token.txt', 'Token do webhook do Zabbix (gerado automaticamente).']],
            [30 * mm, 48 * mm, W - 78 * mm]),
      Paragraph('Endpoints', H2),
      table([['Método e caminho', 'Uso'],
             ['GET /api/&lt;coleção&gt;', 'Lê a coleção inteira.'],
             ['PUT /api/&lt;coleção&gt;', 'Substitui a coleção (corpo: lista JSON, até 5 MB).'],
             ['POST /api/zabbix/webhook', 'Recebe problema/recuperação/atualização do Zabbix. Exige cabeçalho X-Portal-Token.'],
             ['POST /api/zabbix/metric', 'Recebe potência Rx: {"circuit": "...", "rx_dbm": -1.5}. Exige X-Portal-Token.'],
             ['GET /api/leo/status', 'Feed da dashboard Amazon Leo (somente eventos dos 4 circuitos, sem host/IP).']],
            [55 * mm, W - 55 * mm])]

# ── 5 ──
s += [CondPageBreak(60 * mm), Paragraph('5. Páginas e funcionalidades', H1),
      table([['Endereço', 'Página', 'Resumo'],
             ['#/', 'Home', 'Ferramentas, painel de demandas, clientes, busca rápida do almoxarifado.'],
             ['#/rmas', 'RMAs', 'Cadastro e acompanhamento (status, comentários); cola o texto do fornecedor e preenche os campos.'],
             ['#/lambdas', 'Lambdas', 'Mapa DWDM (Infinera, Padtec, Ciena), seções Terminal→Terminal, canais por trecho, OSA, proteção 1+1.'],
             ['#/almoxarifado', 'Almoxarifado', 'Busca instantânea de códigos; botão “Atualizar planilha” importa o relatório .xlsx.'],
             ['#/loa, #/rfo', 'LOA / RFO', 'Geração de documentos em PDF.'],
             ['#/amazon-leo', 'Amazon Leo', 'Dashboard, RFO Amazon Leo e Case Timeline.'],
             ['#/amazon-leo/dashboard', 'Dashboard', 'SLA, Rx, incidentes e status dos circuitos SLZ501 e CPV501 (inglês).'],
             ['#/starlink', 'Starlink', 'Reservado para ferramentas futuras.']],
            [42 * mm, 26 * mm, W - 68 * mm]),
      Spacer(1, 4),
      p('Tema claro/escuro/sistema em Configurações (ícone de engrenagem). O padrão é seguir o sistema operacional.'),
      p('A topologia DWDM (sites e trechos) está fixa em <font face="Courier">assets/js/network-data.js</font>. Ao incluir ou alterar '
        'sites/trechos, rode <font face="Courier">node tools/build-routes.js</font> (precisa de internet) para recalcular o traçado pelas rodovias.')]

# ── 6 ──
s += [CondPageBreak(60 * mm), Paragraph('6. Integração com o Zabbix', H1),
      p('O Zabbix envia cada evento para o portal por um <i>media type</i> do tipo Webhook. O portal não acessa o Zabbix; '
        'apenas recebe. Basta o servidor do Zabbix alcançar o portal na porta 5454.'),
      Paragraph('Configuração no Zabbix', H2),
      *li(['<b>Alertas → Tipos de mídia</b>: tipo Webhook “Transmission Portal” (pode ser importado do arquivo '
           'zabbix-mediatype-transmission-portal.yaml). Parâmetros url, token e os campos do evento ({EVENT.ID}, {EVENT.VALUE}, '
           '{EVENT.NSEVERITY}, {HOST.HOST}, {EVENT.NAME}, {EVENT.TAGSJSON}, datas e horas, tz_offset).',
           '<b>Usuário</b> com essa mídia (“Enviar para”: qualquer texto, ex. portal), todas as severidades, e permissão de leitura nos hosts da Amazon Leo.',
           '<b>Ação de trigger</b> filtrando os hosts/tags da Amazon Leo, com operações, operações de recuperação e de atualização enviando para esse usuário.']),
      p('Script do media type:'),
      code("var p = JSON.parse(value), req = new HttpRequest();\n"
           "var url = p.url, token = p.token;\n"
           "delete p.url; delete p.token;\n"
           "req.addHeader('Content-Type: application/json');\n"
           "req.addHeader('X-Portal-Token: ' + token);\n"
           "var resp = req.post(url, JSON.stringify(p));\n"
           "if (req.getStatus() !== 200) { throw 'Portal respondeu HTTP ' + req.getStatus() + ': ' + resp; }\n"
           "return 'OK';"),
      Paragraph('Como o evento é ligado ao circuito', H2),
      *li(['Procura o ID do circuito (RJOOCR964161, SPOOCR964174, 21-90090-252671, 21-90090-252668) na tag <b>circuit</b>, no host, no nome do trigger, nos dados operacionais e nas tags.',
           'Se não achar o circuito, procura o site (SLZ501 / CPV501); evento só com site vale para os dois circuitos daquele site.',
           'Macros não resolvidas (ex.: {HOST.HOST} no botão Testar) são ignoradas.',
           'Token: variável de ambiente ZBX_TOKEN ou, se não existir, o arquivo server/data/zabbix-token.txt (criado na primeira execução).'])]

# ── 7 ──
s += [CondPageBreak(60 * mm), Paragraph('7. Dashboard Amazon Leo', H1),
      KeepTogether(table([['Site', 'Circuito', 'Ponta'],
             ['SLZ501 — Ocara, CE', 'RJOOCR964161', 'Equinix RJ2'],
             ['SLZ501 — Ocara, CE', 'SPOOCR964174', 'Equinix SP4'],
             ['CPV501 — Sanharó, PE', '21-90090-252671', 'Equinix SP4'],
             ['CPV501 — Sanharó, PE', '21-90090-252668', 'Equinix RJ2']],
            [50 * mm, 45 * mm, W - 95 * mm])),
      Spacer(1, 6),
      *li(['<b>Status</b>: problema ativo de severidade Alta ou Desastre = <i>Circuit down</i>; Atenção ou Média = <i>Degraded</i>; '
           'Informação e Não classificada são ignorados.',
           '<b>SLA</b> = 1 − (tempo com problema Alta/Desastre no período ÷ duração do período). Intervalos sobrepostos contam uma vez. '
           'O período começa no primeiro evento conhecido (histórico importado a partir de 07/07/2026).',
           '<b>Filtros</b>: site, 24h/7d/30d/90d (padrão 30d) e UTC/BRT (padrão UTC). Atualiza a cada 10 s.',
           '<b>Rx signal</b>: aparece quando há dados em POST /api/zabbix/metric (ainda não configurado no Zabbix).',
           'Os IDs, sites e pontas dos circuitos ficam em assets/js/leo-dash.js e server/zabbix.js (manter os dois iguais).'])]

# ── 8 ──
s += [CondPageBreak(60 * mm), Paragraph('8. Instalação com Docker', H1),
      p('Pré-requisitos na VM: Docker Engine com o plugin Compose, acesso ao repositério GitHub (ou cópia dos arquivos) e a porta 5454 liberada no firewall '
        '(para os usuários e para o servidor do Zabbix).'),
      Paragraph('Primeira instalação', H2),
      code("git clone git@github.com:antonyllz/transmission-portal.git\n"
           "cd transmission-portal\n"
           "mkdir -p data                 # dados persistentes (montado em /app/server/data)\n"
           "docker compose up -d --build\n"
           "docker compose ps             # STATUS deve ficar 'healthy'\n"
           "docker compose logs -f        # deve mostrar as portas 5454 e 5455"),
      p('Acesse <font face="Courier">http://&lt;ip-da-vm&gt;:5454</font>. Para usar outra porta, altere só o lado esquerdo em '
        '<font face="Courier">ports: "5454:5454"</font> no docker-compose.yml (e a URL do webhook no Zabbix).'),
      Paragraph('Variáveis de ambiente', H2),
      table([['Variável', 'Padrão', 'Uso'],
             ['PUBLIC_PORT', '5454', 'Porta do site dentro do container.'],
             ['API_PORT / PORT', '5455', 'Porta interna da API (não exposta).'],
             ['DATA_DIR', '/app/server/data', 'Pasta dos dados (volume).'],
             ['ZBX_TOKEN', '(arquivo no volume)', 'Token do webhook; se definido, substitui o zabbix-token.txt.'],
             ['TZ', 'UTC', 'Fuso do container (os dados são gravados em UTC).']],
            [35 * mm, 38 * mm, W - 73 * mm]),
      Paragraph('Atualizar para uma nova versão', H2),
      code("cd transmission-portal\n"
           "git pull\n"
           "docker compose up -d --build   # os dados em ./data são preservados"),
      Paragraph('Sem Docker (alternativa)', H2),
      p('Com Node.js 18+ instalado: <font face="Courier">node docker/start.js</font> na raiz do projeto (ou PM2 com ecosystem.config.js). '
        'Os dados ficam em server/data/.')]

# ── 9 ──
s += [CondPageBreak(60 * mm), Paragraph('9. Migração da VPS atual', H1),
      p('Os dados atuais estão na VPS (162.35.184.190) em <font face="Courier">~/transmission-portal/server/data/</font>. '
        'Para levar tudo para a VM da empresa:'),
      code("# 1) na VPS atual: empacotar os dados\n"
           "cd ~/transmission-portal/server && tar czf ~/portal-data.tgz data\n\n"
           "# 2) copiar para a VM nova\n"
           "scp usuario@162.35.184.190:~/portal-data.tgz .\n\n"
           "# 3) na VM nova, dentro da pasta do projeto, antes do 'docker compose up'\n"
           "tar xzf portal-data.tgz          # cria ./data com todos os JSON e o token\n"
           "docker compose up -d --build"),
      *li(['Copiando o <b>zabbix-token.txt</b> junto, o token continua o mesmo: no Zabbix basta trocar o parâmetro <b>url</b> do media type para o endereço novo.',
           'Para evitar perda, pare a gravação na VPS antiga (pm2 stop transmission-portal transmission-portal-api) logo antes do passo 1 e aponte o Zabbix para a VM nova em seguida.',
           'Os usuários têm um cache local por navegador; ao abrir o endereço novo, os dados vêm do servidor normalmente.'])]

# ── 10 ──
s += [CondPageBreak(60 * mm), Paragraph('10. Operação e manutenção', H1),
      table([['Tarefa', 'Comando / ação'],
             ['Ver logs', 'docker compose logs -f'],
             ['Reiniciar', 'docker compose restart'],
             ['Parar', 'docker compose down (os dados em ./data permanecem)'],
             ['Backup', 'tar czf backup-$(date +%F).tgz data  (agendar no cron, ex. diariamente)'],
             ['Restaurar', 'docker compose down; restaurar a pasta data; docker compose up -d'],
             ['Trocar o token do Zabbix', 'Apagar data/zabbix-token.txt (ou definir ZBX_TOKEN), reiniciar e atualizar o parâmetro token no Zabbix.'],
             ['Atualizar almoxarifado', 'Na página Almoxarifado, “Atualizar planilha” e escolher o .xlsx.'],
             ['Alterar topologia DWDM', 'Editar assets/js/network-data.js, rodar node tools/build-routes.js, rebuild.']],
            [45 * mm, W - 45 * mm])]

# ── 11 ──
s += [CondPageBreak(60 * mm), Paragraph('11. Segurança e observações', H1),
      *li(['O portal <b>não tem login</b>: qualquer pessoa que alcance a porta consegue ler e alterar os dados. Recomenda-se deixá-lo acessível só na rede interna/VPN.',
           'Funciona em HTTP. Para HTTPS, coloque um proxy reverso (nginx, Traefik etc.) na frente do container.',
           'O webhook do Zabbix é protegido pelo token (X-Portal-Token). Guarde o token e troque-o se vazar.',
           'Os dados são arquivos JSON: não há banco de dados para administrar, mas o backup da pasta data é essencial.',
           'Escritas simultâneas na mesma coleção: vale a última (uso adequado para um time pequeno).',
           'Os navegadores dos usuários precisam de internet para carregar fontes, mapa (OpenStreetMap) e bibliotecas via CDN.'])]

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                        title='Transmission Portal — Documentação técnica', author='Antony Araújo')
doc.build(s, onFirstPage=lambda c, d: None, onLaterPages=footer)
print(OUT)
