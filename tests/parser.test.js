import { beforeEach, describe, expect, it } from 'vitest'
import { parseWhatsappPayments } from '../src/whatsappParser.js'

// Exemplos reais recebidos via WhatsApp (colados direto do app)
const FULL_TEXT = `[14:59, 22/05/2026] +55 31 8308-3820: Cleiton Henrique de Aquino
CPF 072.240.636-30
Ag 3049
CT 54747-6
Valor 19.014,00

[14:59, 22/05/2026] +55 31 8308-3820: Renato Bento Rodrigues
CPF 069.209.576-47
Ag 3049
CT 32976-2 Sicoob
Valor 20.000,00

[14:59, 22/05/2026] +55 31 8308-3820: Robson Leonardo Pedro
Agência 0316-6
Conta corrente 597082
Banco brasil
CPF 12140897633 pix
Valor 73.274,00

[14:59, 22/05/2026] +55 31 8308-3820: Pix CPF: 13474972693
Thayron Augusto Bertolasse de Carvalho
Valor 10.000,00

[14:59, 22/05/2026] +55 31 8308-3820: Banco cresol
Nome Roberto Vieira da Fonseca
Agência 1642
Conta 145726
CPF 72534532634
Valor 10.000,00

[14:59, 22/05/2026] +55 31 8308-3820: Pix CPF: 03448343609
Tayron Dayan Gama Rodrigues Banco do Brasil
Valor: R$5.100,90`

describe('parseWhatsappPayments — exemplos reais do WhatsApp', () => {
  it('detecta 6 pagamentos no texto completo', () => {
    expect(parseWhatsappPayments(FULL_TEXT)).toHaveLength(6)
  })

  describe('Pagamento 1 — transferência bancária com prefixo CT', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[0] })

    it('remove header e extrai nome', () => {
      expect(p.favorecido).toBe('Cleiton Henrique de Aquino')
    })
    it('formata CPF como documento', () => {
      expect(p.documento).toBe('072.240.636-30')
    })
    it('define tipo CONTA_BANCARIA', () => {
      expect(p.tipoPagamento).toBe('CONTA_BANCARIA')
    })
    it('extrai agência (prefixo Ag)', () => {
      expect(p.agencia).toBe('3049')
    })
    it('extrai conta (prefixo CT)', () => {
      expect(p.conta).toBe('54747-6')
    })
    it('banco nulo — não informado', () => {
      expect(p.banco).toBe('')
    })
    it('parseia valor BRL com ponto de milhar', () => {
      expect(p.valor).toBe(19014)
    })
    it('não marca para revisão', () => {
      expect(p._needsReview).toBe(false)
    })
  })

  describe('Pagamento 2 — CT com banco na mesma linha', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[1] })

    it('extrai nome', () => {
      expect(p.favorecido).toBe('Renato Bento Rodrigues')
    })
    it('formata CPF', () => {
      expect(p.documento).toBe('069.209.576-47')
    })
    it('define tipo CONTA_BANCARIA', () => {
      expect(p.tipoPagamento).toBe('CONTA_BANCARIA')
    })
    it('extrai agência', () => {
      expect(p.agencia).toBe('3049')
    })
    it('separa conta do banco (mesmo campo CT)', () => {
      expect(p.conta).toBe('32976-2')
    })
    it('extrai banco embutido na linha de CT', () => {
      expect(p.banco).toBe('Sicoob')
    })
    it('parseia valor', () => {
      expect(p.valor).toBe(20000)
    })
  })

  describe('Pagamento 3 — "Conta corrente", "Banco brasil", CPF com sufixo pix', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[2] })

    it('extrai nome', () => {
      expect(p.favorecido).toBe('Robson Leonardo Pedro')
    })
    it('define tipo PIX (CPF pix prevalece mesmo com dados bancários)', () => {
      expect(p.tipoPagamento).toBe('PIX')
    })
    it('usa CPF formatado como chave PIX', () => {
      expect(p.chavePix).toBe('121.408.976-33')
    })
    it('formata CPF como documento', () => {
      expect(p.documento).toBe('121.408.976-33')
    })
    it('extrai agência com acento (Agência)', () => {
      expect(p.agencia).toBe('0316-6')
    })
    it('remove qualificador "corrente" da conta', () => {
      expect(p.conta).toBe('597082')
    })
    it('normaliza "Banco brasil" → "Banco do Brasil"', () => {
      expect(p.banco).toBe('Banco do Brasil')
    })
    it('parseia valor', () => {
      expect(p.valor).toBe(73274)
    })
  })

  describe('Pagamento 4 — PIX via CPF, nome na segunda linha', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[3] })

    it('extrai nome da segunda linha (depois da chave PIX)', () => {
      expect(p.favorecido).toBe('Thayron Augusto Bertolasse de Carvalho')
    })
    it('define tipo PIX', () => {
      expect(p.tipoPagamento).toBe('PIX')
    })
    it('usa CPF formatado como chave PIX', () => {
      expect(p.chavePix).toBe('134.749.726-93')
    })
    it('preenche documento com o CPF da chave PIX', () => {
      expect(p.documento).toBe('134.749.726-93')
    })
    it('parseia valor', () => {
      expect(p.valor).toBe(10000)
    })
  })

  describe('Pagamento 5 — "Banco cresol" na primeira linha, keyword "Nome"', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[4] })

    it('extrai nome via keyword "Nome"', () => {
      expect(p.favorecido).toBe('Roberto Vieira da Fonseca')
    })
    it('normaliza "Banco cresol" → "Banco Cresol"', () => {
      expect(p.banco).toBe('Banco Cresol')
    })
    it('define tipo CONTA_BANCARIA', () => {
      expect(p.tipoPagamento).toBe('CONTA_BANCARIA')
    })
    it('extrai agência', () => {
      expect(p.agencia).toBe('1642')
    })
    it('extrai conta', () => {
      expect(p.conta).toBe('145726')
    })
    it('formata CPF como documento', () => {
      expect(p.documento).toBe('725.345.326-34')
    })
    it('parseia valor', () => {
      expect(p.valor).toBe(10000)
    })
  })

  describe('Pagamento 6 — PIX via CPF, banco junto ao nome', () => {
    let p
    beforeEach(() => { p = parseWhatsappPayments(FULL_TEXT)[5] })

    it('extrai nome sem o banco (que estava na mesma linha)', () => {
      expect(p.favorecido).toBe('Tayron Dayan Gama Rodrigues')
    })
    it('define tipo PIX', () => {
      expect(p.tipoPagamento).toBe('PIX')
    })
    it('usa CPF formatado como chave PIX', () => {
      expect(p.chavePix).toBe('034.483.436-09')
    })
    it('preenche documento com o CPF da chave PIX', () => {
      expect(p.documento).toBe('034.483.436-09')
    })
    it('extrai banco "Banco do Brasil" do final do nome', () => {
      expect(p.banco).toBe('Banco do Brasil')
    })
    it('parseia "Valor: R$5.100,90" corretamente', () => {
      expect(p.valor).toBe(5100.9)
    })
  })
})

describe('parseWhatsappPayments — casos unitários', () => {
  it('retorna array vazio para texto vazio', () => {
    expect(parseWhatsappPayments('')).toHaveLength(0)
    expect(parseWhatsappPayments(null)).toHaveLength(0)
  })

  it('detecta múltiplos pagamentos separados por linha em branco', () => {
    const text = `João Silva
CPF 12345678901
Pix 12345678901
Valor 1.000,00

Maria Souza
CPF 98765432100
Pix 98765432100
Valor 2.000,00`
    const result = parseWhatsappPayments(text)
    expect(result).toHaveLength(2)
    expect(result[0].favorecido).toBe('João Silva')
    expect(result[1].favorecido).toBe('Maria Souza')
  })

  it('separa blocos mesmo sem linha em branco quando há novo header do WhatsApp', () => {
    const text = `[10:00, 01/01/2026] +55 11 91234-5678: João Silva
Pix 12345678901
Valor 500,00
[10:01, 01/01/2026] +55 11 91234-5678: Maria Souza
Pix 98765432100
Valor 300,00`
    const result = parseWhatsappPayments(text)
    expect(result).toHaveLength(2)
    expect(result[0].favorecido).toBe('João Silva')
    expect(result[1].favorecido).toBe('Maria Souza')
  })

  it('formata CPF como chave PIX e documento (Pix CPF:)', () => {
    const text = `Pix CPF: 13474972693
Thayron Bertolasse
Valor 10.000,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.tipoPagamento).toBe('PIX')
    expect(p.chavePix).toBe('134.749.726-93')
    expect(p.documento).toBe('134.749.726-93')
  })

  it('formata CNPJ como chave PIX e documento (Pix CNPJ:)', () => {
    const text = `José Empresa LTDA
Pix CNPJ: 12.345.678/0001-99
Valor 5.000,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.tipoPagamento).toBe('PIX')
    expect(p.chavePix).toBe('12.345.678/0001-99')
    expect(p.documento).toBe('12.345.678/0001-99')
  })

  it('usa CPF como chave PIX quando não há dados bancários (sufixo pix)', () => {
    const text = `Ana Paula
CPF 111.222.333-44 pix
Valor 750,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.tipoPagamento).toBe('PIX')
    expect(p.chavePix).toBe('111.222.333-44')
    expect(p.documento).toBe('111.222.333-44')
  })

  it('CPF com sufixo pix define tipo PIX mesmo com agência e conta presentes', () => {
    const text = `Pedro Costa
CPF 111.222.333-44 pix
Ag 1234
CT 56789-0
Valor 750,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.tipoPagamento).toBe('PIX')
    expect(p.chavePix).toBe('111.222.333-44')
    expect(p.documento).toBe('111.222.333-44')
    expect(p.agencia).toBe('1234')
    expect(p.conta).toBe('56789-0')
  })

  it('formata CPF mesmo sem sufixo pix', () => {
    const text = `Luisa Santos
CPF 98765432100
Ag 1001
Conta 55443322
Valor 300,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.documento).toBe('987.654.321-00')
    expect(p.tipoPagamento).toBe('CONTA_BANCARIA')
  })

  it('detecta banco no final da linha de nome', () => {
    const text = `Pix CPF: 03448343609
Carlos Eduardo Pereira Santander
Valor 1.000,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.favorecido).toBe('Carlos Eduardo Pereira')
    expect(p.banco).toBe('Santander')
    expect(p.tipoPagamento).toBe('PIX')
  })

  it('não divide nome muito curto ao tentar extrair banco', () => {
    // "João Sicoob" tem só 2 palavras → não tenta extrair banco (exige mín. 3)
    const text = `João Sicoob
Ag 1234
Conta 56789
Valor 100,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.favorecido).toBe('João Sicoob')
    expect(p.banco).toBe('') // banco não foi extraído do nome de 2 palavras
  })

  it('marca para revisão quando falta o nome', () => {
    const text = `Pix CPF: 12345678901
Valor 100,00`
    const [p] = parseWhatsappPayments(text)
    expect(p._needsReview).toBe(true)
    expect(p._reviewReasons).toContain('Nome não detectado')
  })

  it('marca para revisão quando falta o valor', () => {
    const text = `Carlos Alberto
Pix 12345678901`
    const [p] = parseWhatsappPayments(text)
    expect(p._needsReview).toBe(true)
    expect(p._reviewReasons).toContain('Valor não detectado')
  })

  it('parseia valor sem prefixo VALOR (só número com vírgula)', () => {
    const text = `Fernando Lima
Pix 11122233344
1.500,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.valor).toBe(1500)
  })

  it('reconhece Conta corrente e Conta poupança', () => {
    const text = `Maria Aparecida
Ag 0001
Conta poupança 12345-6
Valor 200,00`
    const [p] = parseWhatsappPayments(text)
    expect(p.conta).toBe('12345-6')
    expect(p.tipoPagamento).toBe('CONTA_BANCARIA')
  })

  it('normaliza banco via KNOWN_BANKS', () => {
    const normas = [
      ['Banco brasil', 'Banco do Brasil'],
      ['cresol', 'Banco Cresol'],
      ['sicoob', 'Sicoob'],
      ['BRADESCO', 'Bradesco'],
      ['nubank', 'Nubank'],
    ]
    for (const [input, expected] of normas) {
      const text = `Fulano\nBanco ${input}\nAg 1\nConta 2\nValor 100,00`
      const [p] = parseWhatsappPayments(text)
      expect(p.banco).toBe(expected)
    }
  })
})
