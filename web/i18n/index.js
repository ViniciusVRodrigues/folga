import { messages } from './pt-BR.js';

const plural = new Intl.PluralRules('pt-BR');

/** Marca uma chave de mensagem usada em mapas (o teste de i18n a confere). */
export const k = (key) => key;

/**
 * t('chave', { n: 3, nome: 'x' }): substitui {nome}. Se a mensagem é um objeto
 * { one, other }, escolhe pela regra de plural de `n`.
 */
export function t(key, params = {}) {
  let msg = messages[key];
  if (msg === undefined) {
    if (typeof console !== 'undefined') console.warn('i18n: chave ausente', key);
    return key;
  }
  if (typeof msg === 'object') {
    const n = Number(params.n ?? 0);
    msg = n === 0 && msg.zero !== undefined ? msg.zero : msg[plural.select(n)] ?? msg.other;
  }
  return msg.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}
