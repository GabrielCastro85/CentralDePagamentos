// Parser de listas de pagamento recebidas via WhatsApp
// Suporta texto bagunçado, headers do WhatsApp, abreviações variadas e banco embutido na linha de conta

const KNOWN_BANKS = {
  'BRASIL': 'Banco do Brasil',
  'BANCO BRASIL': 'Banco do Brasil',
  'BANCOBRASIL': 'Banco do Brasil',
  'BB': 'Banco do Brasil',
  'BANCO DO BRASIL': 'Banco do Brasil',
  'CAIXA': 'Caixa Econômica Federal',
  'CEF': 'Caixa Econômica Federal',
  'CAIXA ECONOMICA': 'Caixa Econômica Federal',
  'CAIXA ECONOMICA FEDERAL': 'Caixa Econômica Federal',
  'BRADESCO': 'Bradesco',
  'ITAU': 'Itaú',
  'SANTANDER': 'Santander',
  'NUBANK': 'Nubank',
  'INTER': 'Banco Inter',
  'BANCO INTER': 'Banco Inter',
  'SICOOB': 'Sicoob',
  'BANCOOB': 'Sicoob',
  'SICREDI': 'Sicredi',
  'CRESOL': 'Banco Cresol',
  'BANCO CRESOL': 'Banco Cresol',
  'BANESTES': 'Banestes',
  'BANPARA': 'Banpará',
  'DAYCOVAL': 'Banco Daycoval',
  'PAN': 'Banco Pan',
  'BMG': 'Banco BMG',
  'ORIGINAL': 'Banco Original',
  'C6': 'C6 Bank',
  'C6 BANK': 'C6 Bank',
  'PICPAY': 'PicPay',
  'MERCADO PAGO': 'Mercado Pago',
  'PAGBANK': 'PagBank',
  'PAGSEGURO': 'PagBank',
  'NEXT': 'Next',
  'WILL BANK': 'Will Bank',
  'STONE': 'Stone',
  'SAFRA': 'Banco Safra',
  'VOTORANTIM': 'Banco Votorantim',
  'BV': 'Banco BV',
  'RENDIMENTO': 'Banco Rendimento',
  'MERCANTIL': 'Banco Mercantil',
}

// Pares [chave, valor] ordenados por palavras (decrescente) para detectar sufixo de banco no nome
// Exclui abreviações curtas que podem ser confundidas com nomes (< 6 chars e sem espaço)
const BANK_SUFFIX_KEYS = Object.entries(KNOWN_BANKS)
  .filter(([k]) => k.includes(' ') || k.length >= 6)
  .sort(([a], [b]) => {
    const wa = a.split(' ').length
    const wb = b.split(' ').length
    return wb - wa || b.length - a.length
  })

// Remove o header de mensagem do WhatsApp
// Formatos: [HH:MM, DD/MM/YYYY] +55 31 8308-3820: conteúdo
//           [HH:MM:SS, DD/MM/YYYY] Nome: conteúdo
function stripWhatsappHeader(line) {
  return line.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?(?:[,\s]\s*\d{2}\/\d{2}\/\d{4})?\]\s*[^[\]:]+:\s*/, '')
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

function cleanValue(value) {
  return String(value || '').trim().replace(/^[:-]\s*/, '').trim()
}

function parseMoneyValue(str) {
  const text = String(str || '').replace(/[^\d,.]/g, '')
  if (!text) return 0
  if (/,\d{1,2}$/.test(text)) {
    return Number(text.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (/\.\d{1,2}$/.test(text) && !text.includes(',')) {
    return Number(text.replace(/,/g, '')) || 0
  }
  return Number(text.replace(/\D/g, '')) || 0
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

// Formata CPF (11 dígitos) ou CNPJ (14 dígitos). Retorna original se não reconhecer.
function formatCpfCnpj(value) {
  const d = digitsOnly(value)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return String(value || '').trim()
}

function normalizeBank(raw) {
  if (!raw) return ''
  const key = normalizeText(raw)
  return KNOWN_BANKS[key] || raw.trim()
}

// Detecta banco conhecido no final de uma linha de nome
// Ex: "Tayron Dayan Gama Rodrigues Banco do Brasil" → { name: "Tayron...", banco: "Banco do Brasil" }
function extractTrailingBank(line) {
  const upper = normalizeText(line)
  const words = upper.split(/\s+/)

  // Exige ao menos 3 palavras (2 de nome + 1 de banco)
  if (words.length < 3) return { name: line.trim(), banco: null }

  for (const [bankKey, bankName] of BANK_SUFFIX_KEYS) {
    const bankWords = bankKey.split(/\s+/)
    if (bankWords.length >= words.length) continue

    const suffix = words.slice(-bankWords.length).join(' ')
    if (suffix === bankKey) {
      const nameWordCount = words.length - bankWords.length
      if (nameWordCount < 1) continue
      const nameParts = line.trim().split(/\s+/).slice(0, nameWordCount)
      return { name: nameParts.join(' '), banco: bankName }
    }
  }

  return { name: line.trim(), banco: null }
}

// Pré-processa o texto: remove headers do WhatsApp e insere separadores entre mensagens
function preprocessLines(text) {
  const raw = String(text || '').split(/\r?\n/)
  const result = []

  for (const rawLine of raw) {
    const trimmed = rawLine.trim()
    const stripped = stripWhatsappHeader(trimmed).trim()
    const hadHeader = stripped !== trimmed

    if (hadHeader) {
      // Garante separador antes de cada nova mensagem (caso não haja linha em branco)
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('')
      }
      if (stripped) result.push(stripped)
    } else {
      result.push(trimmed)
    }
  }

  return result
}

// Keywords que indicam campos de pagamento (testa contra texto normalizado)
const DETAIL_RE =
  /^(PIX|CHAVE\s*PIX|VALOR|R\$|CPF|CNPJ|DOCUMENTO|AG\.?|AGENCIA|CC|C\/C|CONTA|CT|BANCO|NOME)\b/

function looksLikePaymentDetail(line) {
  return DETAIL_RE.test(normalizeText(line))
}

function looksLikeNameLine(line) {
  if (!line || looksLikePaymentDetail(line)) return false
  if (/@/.test(line)) return false
  if (/^\[/.test(line)) return false
  if (/^\d+([.,]\d{1,2})?$/.test(line)) return false
  return /[A-Za-zÀ-ÿ]/.test(line)
}

function looksLikeTrailingBank(line, currentLines) {
  const upper = normalizeText(line)
  const hasAccountData = currentLines.some((item) =>
    /^(AG\.?|AGENCIA|CC|C\/C|CONTA|CT)\b/.test(normalizeText(item))
  )
  const wordCount = upper.split(/\s+/).filter(Boolean).length
  return hasAccountData && wordCount <= 4 && /^[A-Z0-9 .-]{3,}$/.test(upper)
}

// Remove qualificadores de tipo de conta ("corrente", "poupança") do início do valor
function stripAccountTypeQualifier(value) {
  return value.replace(/^(corrente|poupan[cç]a|sal[aá]rio)\s+/i, '').trim()
}

// Separa número de conta do banco quando estão na mesma linha
// Ex: "32976-2 Sicoob" → { conta: "32976-2", banco: "Sicoob" }
function splitAccountAndBank(value) {
  const m = value.match(/^([\d./-]+)\s+([A-Za-zÀ-ÿ].*)$/)
  if (m) return { conta: m[1].trim(), banco: m[2].trim() }
  return { conta: value.trim(), banco: null }
}

function splitBlocks(lines) {
  const blocks = []
  let current = []

  for (const line of lines) {
    if (!line) {
      if (current.length) {
        blocks.push(current)
        current = []
      }
      continue
    }

    // Só divide se o bloco atual já tem um nome — evita separar nome de sua chave PIX anterior
    if (
      current.length &&
      looksLikeNameLine(line) &&
      current.some(looksLikePaymentDetail) &&
      current.some(looksLikeNameLine) &&
      !looksLikeTrailingBank(line, current)
    ) {
      blocks.push(current)
      current = [line]
      continue
    }

    current.push(line)
  }

  if (current.length) blocks.push(current)
  return blocks
}

function parseBlock(lines, index) {
  const p = {
    importId: `import-${Date.now()}-${index}`,
    favorecido: '',
    documento: '',
    tipoPagamento: 'PIX',
    chavePix: '',
    banco: '',
    agencia: '',
    tipoConta: 'NAO_INFORMADO',
    conta: '',
    digito: '',
    valor: 0,
    pago: false,
    comprovanteEnviado: false,
    observacao: 'Importado do WhatsApp',
    _needsReview: false,
    _reviewReasons: [],
    _pixFromDoc: null,
  }

  let foundName = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const upper = normalizeText(line)

    // PIX: "Pix CPF: ...", "PIX CNPJ: ...", "PIX telefone: ...", "PIX chavelivre"
    if (/^PIX\b/.test(upper)) {
      p.tipoPagamento = 'PIX'
      const after = line.replace(/^PIX\s*/i, '').trim()
      const sub = after.match(/^(CPF|CNPJ|TELEFONE|EMAIL|CHAVE)\s*[:-]?\s*(.*)/i)
      if (sub) {
        const rawKey = sub[2].trim()
        const numKey = digitsOnly(rawKey)
        if (/CPF|CNPJ/i.test(sub[1])) {
          const formatted = formatCpfCnpj(numKey)
          p.chavePix = formatted
          p.documento = formatted
        } else {
          p.chavePix = rawKey // telefone, email, etc.
        }
      } else if (after) {
        p.chavePix = cleanValue(after)
      }
      continue
    }

    // CHAVE PIX
    if (/^CHAVE\s*PIX\b/.test(upper)) {
      p.tipoPagamento = 'PIX'
      p.chavePix = cleanValue(line.replace(/^CHAVE\s*PIX\s*[:-]?\s*/i, ''))
      continue
    }

    // VALOR
    if (/^VALOR\b/.test(upper)) {
      p.valor = parseMoneyValue(line.replace(/^VALOR\s*[:-]?\s*/i, ''))
      continue
    }

    // R$ solto (sem prefixo VALOR)
    if (/^R\$/.test(line.trim())) {
      if (!p.valor) p.valor = parseMoneyValue(line)
      continue
    }

    // CPF / CNPJ / DOCUMENTO
    if (/^(CPF|CNPJ|DOCUMENTO)\b/.test(upper)) {
      const docRaw = line.replace(/^(CPF|CNPJ|DOCUMENTO)\s*[:-]?\s*/i, '').trim()
      const hasPix = /\bpix\b/i.test(docRaw)
      const docClean = digitsOnly(docRaw.replace(/\bpix\b/i, '').trim())
      p.documento = formatCpfCnpj(docClean) || docRaw.replace(/\bpix\b/i, '').trim()
      // Quando o operador anota "pix" junto ao CPF, esse CPF é a chave PIX
      if (hasPix) p._pixFromDoc = docClean
      continue
    }

    // AGENCIA / AG / AG.
    if (/^(AG\.?|AGENCIA)\b/.test(upper)) {
      // Coloca alternativas longas primeiro para evitar que "AG" consuma "Agência"
      p.agencia = cleanValue(line.replace(/^(AGENCIA|AGÊNCIA|AG\.?)\s*[:-]?\s*/i, ''))
      continue
    }

    // CONTA / CC / C/C / CT
    if (/^(CC|C\/C|CONTA|CT)\b/.test(upper)) {
      let raw = cleanValue(line.replace(/^(CC|C\/C|CONTA|CT)\s*[:-]?\s*/i, ''))
      raw = stripAccountTypeQualifier(raw)
      const { conta, banco } = splitAccountAndBank(raw)
      p.conta = conta
      if (banco && !p.banco) p.banco = normalizeBank(banco)
      continue
    }

    // BANCO
    if (/^BANCO\b/.test(upper)) {
      p.banco = normalizeBank(cleanValue(line.replace(/^BANCO\s*[:-]?\s*/i, '')))
      continue
    }

    // NOME (keyword explícita de nome)
    if (/^NOME\b/.test(upper)) {
      p.favorecido = cleanValue(line.replace(/^NOME\s*[:-]?\s*/i, ''))
      foundName = true
      continue
    }

    // Valor numérico solto com vírgula decimal (fallback para quando não tem prefixo VALOR)
    if (/^\d[\d.]*,\d{1,2}$/.test(line) && !p.valor) {
      p.valor = parseMoneyValue(line)
      continue
    }

    // Linha de nome: primeira linha elegível vence
    // Tenta separar banco do final (ex: "Tayron Dayan Gama Rodrigues Banco do Brasil")
    if (!foundName && looksLikeNameLine(line)) {
      const { name, banco } = extractTrailingBank(line)
      p.favorecido = cleanValue(name)
      if (banco && !p.banco) p.banco = banco
      foundName = true
    }
  }

  // CPF marcado como chave PIX: SEMPRE prevalece como tipo=PIX (mesmo com dados bancários)
  if (p._pixFromDoc) {
    p.tipoPagamento = 'PIX'
    p.chavePix = formatCpfCnpj(p._pixFromDoc)
  }
  delete p._pixFromDoc

  // Resolução final do tipo
  if (p.chavePix) {
    p.tipoPagamento = 'PIX'
  } else if (p.agencia || p.conta || p.banco) {
    p.tipoPagamento = 'CONTA_BANCARIA'
  }

  // Flags de revisão
  if (!p.favorecido) {
    p._needsReview = true
    p._reviewReasons.push('Nome não detectado')
  }
  if (!p.valor) {
    p._needsReview = true
    p._reviewReasons.push('Valor não detectado')
  }
  if (p.tipoPagamento === 'PIX' && !p.chavePix) {
    p._needsReview = true
    p._reviewReasons.push('Chave PIX não detectada')
  }

  return p
}

export function parseWhatsappPayments(text) {
  const lines = preprocessLines(text)
  const blocks = splitBlocks(lines)
  return blocks
    .map((block, i) => parseBlock(block, i))
    .filter((p) => p.favorecido || p.valor || p.chavePix || p.conta)
}
