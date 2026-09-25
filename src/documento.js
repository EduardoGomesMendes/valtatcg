/**
 * CPF (e CNPJ, se algum dia um cliente pessoa jurídica precisar).
 *
 * Existe porque o Asaas exige `cpfCnpj` para criar um cliente e recusa o
 * cadastro se o número for inválido. Conferir aqui, antes de chamar a API,
 * transforma um erro do gateway em uma mensagem que a pessoa entende, na
 * hora em que ela ainda está com o campo aberto.
 */

export function apenasDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function digitoVerificador(base, pesoInicial) {
  let soma = 0;
  let peso = pesoInicial;

  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso -= 1;
    if (peso < 2) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cpfValido(digitos) {
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i += 1) soma += Number(digitos[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(digitos[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(digitos[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(digitos[10]);
}

function cnpjValido(digitos) {
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const primeiro = digitoVerificador(digitos.slice(0, 12), 5);
  if (primeiro !== Number(digitos[12])) return false;

  const segundo = digitoVerificador(digitos.slice(0, 13), 6);
  return segundo === Number(digitos[13]);
}

/** true para um CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores certos. */
export function documentoValido(valor) {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

/** Formata para leitura: 123.456.789-09 ou 12.345.678/0001-95. */
export function documentoFormatado(valor) {
  const d = apenasDigitos(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}
