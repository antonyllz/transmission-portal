/* ═══════════════════════════════
   NETWORK TOPOLOGY — DWDM sites & spans
   Transcribed from the vendor NMS maps (Infinera, Padtec, Ciena).
   role: 'roadm' | 'terminal' | 'ola' (from the NMS icons / team input).
   Coordinates are the site's city; `approx: true` marks sites whose
   city was inferred from the site code — drag them into place on the
   map ("Ajustar posições") and the new position is saved server-side.
   ═══════════════════════════════ */

var NET_VENDORS = {
  infinera: { label: 'Infinera', color: '#2563eb' },
  padtec:   { label: 'Padtec',   color: '#f97316' },
  ciena:    { label: 'Ciena',    color: '#dc2626' }
};

var NET_SITES = [
  /* ── Nordeste — Infinera backbone ── */
  { id: 'CE-FLA-A01', city: 'Fortaleza',            uf: 'CE', role: 'terminal', lat: -3.7319,  lng: -38.5267 },
  { id: 'CE-BBB-A01', city: 'Beberibe',             uf: 'CE', role: 'ola', lat: -4.1797,  lng: -38.1306, approx: true },
  { id: 'CE-ACA-A01', city: 'Aracati',              uf: 'CE', role: 'ola', lat: -4.5617,  lng: -37.7697 },
  { id: 'RN-MRO-A01', city: 'Mossoró',         uf: 'RN', role: 'terminal', lat: -5.1878,  lng: -37.3441 },
  { id: 'RN-ACU-A01', city: 'Açu',             uf: 'RN', role: 'terminal', lat: -5.5767,  lng: -36.9142 },
  { id: 'RN-CIC-A02', city: 'Caicó',           uf: 'RN', role: 'terminal', lat: -6.4583,  lng: -37.0978, approx: true },
  { id: 'PB-SLZ-A01', city: 'Santa Luzia',          uf: 'PB', role: 'terminal', lat: -6.8719,  lng: -36.9189, approx: true },
  { id: 'PB-SOD-A01', city: 'Soledade',             uf: 'PB', role: 'ola', lat: -7.0578,  lng: -36.3628 },
  { id: 'PB-CGE-A01', city: 'Campina Grande',       uf: 'PB', role: 'terminal', lat: -7.2306,  lng: -35.8811 },
  { id: 'PE-CRU-A03', city: 'Caruaru',              uf: 'PE', role: 'terminal', lat: -8.2836,  lng: -35.9761 },
  { id: 'PE-GUS-A01', city: 'Garanhuns',            uf: 'PE', role: 'terminal', lat: -8.8903,  lng: -36.4928 },
  { id: 'PE-QPA-A01', city: 'Quipapá',         uf: 'PE', role: 'terminal', lat: -8.8278,  lng: -36.0114, approx: true },
  { id: 'AL-AIR-A01', city: 'Arapiraca',            uf: 'AL', role: 'terminal', lat: -9.7525,  lng: -36.6611, approx: true },
  { id: 'AL-MCO-A01', city: 'Maceió',          uf: 'AL', role: 'terminal', lat: -9.6658,  lng: -35.7353 },
  { id: 'AL-OUB-A01', city: 'Ouro Branco',          uf: 'AL', role: 'ola', lat: -9.1589,  lng: -37.3558, approx: true },
  { id: 'BA-PAF-A01', city: 'Paulo Afonso',         uf: 'BA', role: 'terminal', lat: -9.4064,  lng: -38.2147 },
  { id: 'BA-JRO-A01', city: 'Jeremoabo',            uf: 'BA', role: 'ola', lat: -10.0686, lng: -38.3472 },
  { id: 'BA-RBP-A01', city: 'Ribeira do Pombal',    uf: 'BA', role: 'ola', lat: -10.8339, lng: -38.5358 },
  { id: 'BA-SEH-A01', city: 'Serrinha',             uf: 'BA', role: 'ola', lat: -11.6644, lng: -39.0075, approx: true },
  { id: 'BA-FSA-A01', city: 'Feira de Santana',     uf: 'BA', role: 'terminal', lat: -12.2664, lng: -38.9663 },
  { id: 'BA-SDR-A01', city: 'Salvador',             uf: 'BA', role: 'terminal', lat: -12.9714, lng: -38.5014 },
  { id: 'CE-JNE-A01', city: 'Juazeiro do Norte',    uf: 'CE', role: 'terminal', lat: -7.2131,  lng: -39.3151 },
  { id: 'CE-LVM-A01', city: 'Lavras da Mangabeira', uf: 'CE', role: 'ola', lat: -6.7536,  lng: -38.9644 },
  { id: 'PB-SZA-A01', city: 'Sousa',                uf: 'PB', role: 'terminal', lat: -6.7597,  lng: -38.2311 },
  { id: 'PB-SBTP-A01', city: 'São Bentinho',   uf: 'PB', role: 'ola', lat: -6.8958,  lng: -37.7253 },

  /* ── Ceará interior — Padtec ── */
  { id: 'CE-FLA-A04', city: 'Fortaleza (V.Tal)',    uf: 'CE', role: 'terminal', lat: -3.7600,  lng: -38.4900 },
  { id: 'CE-PJS-A01', city: 'Pacajus',              uf: 'CE', role: 'ola', lat: -4.1728,  lng: -38.4606 },
  { id: 'CE-OCR-A01', city: 'Ocara',                uf: 'CE', role: 'terminal', lat: -4.4908,  lng: -38.5967 },
  { id: 'CE-MVA-A01', city: 'Morada Nova',          uf: 'CE', role: 'terminal', lat: -5.1067,  lng: -38.3725 },
  { id: 'CE-JGE-A01', city: 'Jaguaribe',            uf: 'CE', role: 'terminal', lat: -5.8906,  lng: -38.6219 },
  { id: 'CE-JAG-A01', city: 'Jaguaretama',          uf: 'CE', role: 'terminal', lat: -5.6053,  lng: -38.7672 },
  { id: 'RN-PFR-A01', city: 'Pau dos Ferros',       uf: 'RN', role: 'terminal', lat: -6.1092,  lng: -38.2044 },

  /* ── Sudeste — Padtec (MG x RJ) ── */
  { id: 'MG-CEM-A01', city: 'Contagem',             uf: 'MG', role: 'roadm', lat: -19.9317, lng: -44.0536 },
  { id: 'MG-IIE-A01', city: 'Ibirité',         uf: 'MG', role: 'ola', lat: -20.0219, lng: -44.0589 },
  { id: 'MG-SUW-A01', city: 'São Brás do Suaçuí', uf: 'MG', role: 'ola', lat: -20.6247, lng: -43.9514 },
  { id: 'MG-JZF-A01', city: 'Juiz de Fora',         uf: 'MG', role: 'roadm', lat: -21.7642, lng: -43.3503 },
  { id: 'RJ-DQX-A01', city: 'Duque de Caxias',      uf: 'RJ', role: 'roadm', lat: -22.7858, lng: -43.3117 },

  /* ── Sudeste — Ciena (SP x RJ) ── */
  { id: 'SP-LNA-A01', city: 'Lorena',               uf: 'SP', role: 'ola', lat: -22.7311, lng: -45.1247 },
  { id: 'SP-SJC-A01', city: 'São José dos Campos', uf: 'SP', role: 'ola', lat: -23.1794, lng: -45.8869 },
  { id: 'SP-MCZ-A01', city: 'Mogi das Cruzes',      uf: 'SP', role: 'ola', lat: -23.5228, lng: -46.1878 },
  { id: 'SP-SPO-A02', city: 'São Paulo (PIAF)', uf: 'SP', role: 'terminal', lat: -23.5505, lng: -46.6333, approx: true },
  { id: 'SP-SPB-A01', city: 'Santana de Parnaíba (Equinix SP3)', uf: 'SP', role: 'roadm', lat: -23.4663, lng: -46.8633,
    addr: 'Av. Marcos Penteado de Ulhôa Rodrigues, 249 - Santana de Parnaíba/SP' },
  /* ── São Paulo — Padtec ring (Mega Telecom circuits) ── */
  { id: 'SP-SPO-A01', city: 'São Paulo (Eletronet)', uf: 'SP', role: 'roadm', lat: -23.6320, lng: -46.7141,
    addr: 'Av. Alfredo Egídio de Souza Aranha, 100 - Vila Cruzeiro, São Paulo/SP - 04726-170' },
  { id: 'SP-BRE-A02', city: 'Barueri (Equinix SP4)', uf: 'SP', role: 'roadm', lat: -23.4967, lng: -46.8299,
    addr: 'Av. Ceci, 1900 - Tamboré, Barueri/SP - 06460-120' },
  { id: 'SP-BRE-A01', city: 'Barueri (Equinix SP2)', uf: 'SP', role: 'roadm', lat: -23.5026, lng: -46.8271,
    addr: 'Alameda Araguaia, 3641 - Tamboré, Barueri/SP - 06455-000' },
  { id: 'SP-COA-A01', city: 'Cotia (Cirion SAO1)', uf: 'SP', role: 'roadm', lat: -23.5960, lng: -46.8512,
    addr: 'Av. Eid Mansur, 666 (Rod. Raposo Tavares, km 25) - Cotia/SP - 06708-070' },

  { id: 'RJ-BMA-A01', city: 'Barra Mansa',          uf: 'RJ', role: 'ola', lat: -22.5442, lng: -44.1714 },
  { id: 'RJ-RJO-A01', city: 'Rio de Janeiro (Equinix RJ2)', uf: 'RJ', role: 'terminal', lat: -22.8733, lng: -43.2754,
    addr: 'Estr. Adhemar Bebiano, 1380 - Del Castilho, Rio de Janeiro/RJ' },
  { id: 'RJ-RJO-A02', city: 'Rio de Janeiro (V.Tal Vargem Pequena)', uf: 'RJ', role: 'terminal', lat: -22.9921, lng: -43.4464,
    addr: 'Estr. dos Bandeirantes, 12742 - Vargem Pequena, Rio de Janeiro/RJ - 22783-112' },
  { id: 'RJ-RJO-A03', city: 'Rio de Janeiro (Cirion CTL)', uf: 'RJ', role: 'terminal', lat: -22.9026, lng: -43.213,
    addr: 'Av. Pedro II, 329 - São Cristóvão, Rio de Janeiro/RJ - 20941-070' },
  { id: 'RJ-RJO-A04', city: 'São João de Meriti (Scala)', uf: 'RJ', role: 'terminal', lat: -22.798, lng: -43.3572,
    addr: 'Rod. Pres. Dutra, 4656 - Venda Velha, São João de Meriti/RJ' }
];

/* provider = fiber owner, circuit = provider's designator, km = span length (when known from the NMS map) */
var NET_LINKS = [
  /* Infinera */
  { id: 'inf-fla-bbb',  vendor: 'infinera', a: 'CE-FLA-A01',  b: 'CE-BBB-A01' },
  { id: 'inf-bbb-aca',  vendor: 'infinera', a: 'CE-BBB-A01',  b: 'CE-ACA-A01' },
  { id: 'inf-aca-mro',  vendor: 'infinera', a: 'CE-ACA-A01',  b: 'RN-MRO-A01' },
  { id: 'inf-mro-acu',  vendor: 'infinera', a: 'RN-MRO-A01',  b: 'RN-ACU-A01' },
  { id: 'inf-acu-cic',  vendor: 'infinera', a: 'RN-ACU-A01',  b: 'RN-CIC-A02' },
  { id: 'inf-cic-slz',  vendor: 'infinera', a: 'RN-CIC-A02',  b: 'PB-SLZ-A01' },
  { id: 'inf-jne-lvm',  vendor: 'infinera', a: 'CE-JNE-A01',  b: 'CE-LVM-A01' },
  { id: 'inf-lvm-sza',  vendor: 'infinera', a: 'CE-LVM-A01',  b: 'PB-SZA-A01' },
  { id: 'inf-sza-sbtp', vendor: 'infinera', a: 'PB-SZA-A01',  b: 'PB-SBTP-A01' },
  { id: 'inf-sbtp-slz', vendor: 'infinera', a: 'PB-SBTP-A01', b: 'PB-SLZ-A01' },
  { id: 'inf-slz-sod',  vendor: 'infinera', a: 'PB-SLZ-A01',  b: 'PB-SOD-A01' },
  { id: 'inf-sod-cge',  vendor: 'infinera', a: 'PB-SOD-A01',  b: 'PB-CGE-A01' },
  { id: 'inf-cge-cru',  vendor: 'infinera', a: 'PB-CGE-A01',  b: 'PE-CRU-A03' },
  { id: 'inf-cru-gus',  vendor: 'infinera', a: 'PE-CRU-A03',  b: 'PE-GUS-A01' },
  { id: 'inf-cru-qpa',  vendor: 'infinera', a: 'PE-CRU-A03',  b: 'PE-QPA-A01' },
  { id: 'inf-gus-qpa',  vendor: 'infinera', a: 'PE-GUS-A01',  b: 'PE-QPA-A01' },
  { id: 'inf-gus-air',  vendor: 'infinera', a: 'PE-GUS-A01',  b: 'AL-AIR-A01' },
  { id: 'inf-qpa-mco',  vendor: 'infinera', a: 'PE-QPA-A01',  b: 'AL-MCO-A01' },
  { id: 'inf-gus-oub',  vendor: 'infinera', a: 'PE-GUS-A01',  b: 'AL-OUB-A01' },
  { id: 'inf-oub-paf',  vendor: 'infinera', a: 'AL-OUB-A01',  b: 'BA-PAF-A01' },
  { id: 'inf-paf-jro',  vendor: 'infinera', a: 'BA-PAF-A01',  b: 'BA-JRO-A01' },
  { id: 'inf-jro-rbp',  vendor: 'infinera', a: 'BA-JRO-A01',  b: 'BA-RBP-A01' },
  { id: 'inf-rbp-seh',  vendor: 'infinera', a: 'BA-RBP-A01',  b: 'BA-SEH-A01' },
  { id: 'inf-seh-fsa',  vendor: 'infinera', a: 'BA-SEH-A01',  b: 'BA-FSA-A01' },
  { id: 'inf-fsa-sdr',  vendor: 'infinera', a: 'BA-FSA-A01',  b: 'BA-SDR-A01' },

  /* Padtec — Ceará */
  { id: 'pad-fla-pjs',  vendor: 'padtec', a: 'CE-FLA-A04', b: 'CE-PJS-A01' },
  { id: 'pad-pjs-ocr',  vendor: 'padtec', a: 'CE-PJS-A01', b: 'CE-OCR-A01' },
  { id: 'pad-ocr-mva',  vendor: 'padtec', a: 'CE-OCR-A01', b: 'CE-MVA-A01' },
  { id: 'pad-mva-jag',  vendor: 'padtec', a: 'CE-MVA-A01', b: 'CE-JAG-A01' },
  { id: 'pad-jag-jge',  vendor: 'padtec', a: 'CE-JAG-A01', b: 'CE-JGE-A01' },
  { id: 'pad-jge-pfr',  vendor: 'padtec', a: 'CE-JGE-A01', b: 'RN-PFR-A01' },
  { id: 'pad-pfr-sza',  vendor: 'padtec', a: 'RN-PFR-A01', b: 'PB-SZA-A01' },

  /* Padtec — Rio de Janeiro x Contagem */
  { id: 'pad-cem-iie-century', vendor: 'padtec', a: 'MG-CEM-A01', b: 'MG-IIE-A01', provider: 'Century', km: 23.55 },
  { id: 'pad-cem-iie-algar',   vendor: 'padtec', a: 'MG-CEM-A01', b: 'MG-IIE-A01', provider: 'Algar',   km: 21 },
  { id: 'pad-iie-suw',         vendor: 'padtec', a: 'MG-IIE-A01', b: 'MG-SUW-A01', provider: 'Algar',   km: 88.172 },
  { id: 'pad-suw-jzf',         vendor: 'padtec', a: 'MG-SUW-A01', b: 'MG-JZF-A01', provider: 'Algar',   km: 145 },
  { id: 'pad-jzf-dqx',         vendor: 'padtec', a: 'MG-JZF-A01', b: 'RJ-DQX-A01', provider: 'Algar',   km: 117.23 },

  /* Padtec — anel São Paulo (Mega Telecom) */
  { id: 'pad-spo1-bre2', vendor: 'padtec', a: 'SP-SPO-A01', b: 'SP-BRE-A02', provider: 'Mega Telecom', circuit: 'CT25329CIR05' },
  { id: 'pad-bre2-spb',  vendor: 'padtec', a: 'SP-BRE-A02', b: 'SP-SPB-A01', provider: 'Mega Telecom', circuit: 'CT25329CIR01' },
  { id: 'pad-spb-bre1',  vendor: 'padtec', a: 'SP-SPB-A01', b: 'SP-BRE-A01', provider: 'Mega Telecom', circuit: 'CT25329CIR02' },
  { id: 'pad-bre1-coa',  vendor: 'padtec', a: 'SP-BRE-A01', b: 'SP-COA-A01', provider: 'Mega Telecom', circuit: 'CT25329CIR03' },
  { id: 'pad-coa-spo1',  vendor: 'padtec', a: 'SP-COA-A01', b: 'SP-SPO-A01', provider: 'Mega Telecom', circuit: 'CT25329CIR04' },

  /* Ciena — São Paulo x Rio */
  { id: 'cie-lna-sjc',        vendor: 'ciena', a: 'SP-LNA-A01', b: 'SP-SJC-A01', km: 100 },
  { id: 'cie-sjc-mcz',        vendor: 'ciena', a: 'SP-SJC-A01', b: 'SP-MCZ-A01', km: 78 },
  { id: 'cie-mcz-spo-algar',  vendor: 'ciena', a: 'SP-MCZ-A01', b: 'SP-SPO-A02', provider: 'Algar', km: 92 },
  { id: 'cie-mcz-spo-claro',  vendor: 'ciena', a: 'SP-MCZ-A01', b: 'SP-SPO-A02', provider: 'Claro', km: 98 },
  { id: 'cie-spo-spb-algar',  vendor: 'ciena', a: 'SP-SPO-A02', b: 'SP-SPB-A01', provider: 'Algar', km: 55 },
  { id: 'cie-spo-spb-upix',   vendor: 'ciena', a: 'SP-SPO-A02', b: 'SP-SPB-A01', provider: 'UPIX',  km: 58 },
  { id: 'cie-lna-bma',        vendor: 'ciena', a: 'SP-LNA-A01', b: 'RJ-BMA-A01', km: 120 },
  { id: 'cie-bma-dqx',        vendor: 'ciena', a: 'RJ-BMA-A01', b: 'RJ-DQX-A01', km: 122 },
  { id: 'cie-dqx-rjo-algar',  vendor: 'ciena', a: 'RJ-DQX-A01', b: 'RJ-RJO-A01', provider: 'Algar', km: 44.473 },
  { id: 'cie-dqx-rjo-altarede', vendor: 'ciena', a: 'RJ-DQX-A01', b: 'RJ-RJO-A01', provider: 'Altarede / Corelink / Telmais', km: 42.252 },
  { id: 'cie-rjo1-rjo2-claro', vendor: 'ciena', a: 'RJ-RJO-A01', b: 'RJ-RJO-A02', provider: 'Claro', km: 57.3 },
  { id: 'cie-rjo1-rjo2-algar', vendor: 'ciena', a: 'RJ-RJO-A01', b: 'RJ-RJO-A02', provider: 'Algar', km: 52.8 },
  { id: 'cie-rjo3-rjo4-a',    vendor: 'ciena', a: 'RJ-RJO-A03', b: 'RJ-RJO-A04', label: 'Rota 1' },
  { id: 'cie-rjo3-rjo4-b',    vendor: 'ciena', a: 'RJ-RJO-A03', b: 'RJ-RJO-A04', label: 'Rota 2' }
];

/* who to call when a provider's span goes down (shown on the section panel) */
var NET_PROVIDERS = {
  'Mega Telecom': {
    email: 'noc@megatelecom.com.br',
    note: 'Em caso de indisponibilidade, acionar a Mega Telecom por e-mail informando o trecho inoperante e o respectivo designador.'
  }
};
