/* TENNER. — datas das renovações (fuso horário de Portugal)
   Datas guardadas como texto "AAAA-MM-DD". */
(function (root) {
  'use strict';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var partes = function (s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; };
  var diasNoMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }; // m: 1-12

  // "hoje" em Portugal (Europe/Lisbon), independentemente do fuso do computador
  function hojePT(agora) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora || new Date());
    } catch (e) {
      var d = agora || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
  }
  // soma dias a uma data AAAA-MM-DD
  function somaDias(s, n) {
    var p = partes(s), d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // mês seguinte, mantendo o dia de referência; se o mês não tiver esse dia usa o último dia do mês
  function mesSeguinte(s, diaRef) {
    var p = partes(s), y = p.y, m = p.m + 1;
    if (m > 12) { m = 1; y++; }
    var d = Math.min(diaRef || p.d, diasNoMes(y, m));
    return y + '-' + pad(m) + '-' + pad(d);
  }
  var diaDe = function (s) { return partes(s).d; };
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var porExtenso = function (s) { var p = partes(s); return p.d + ' de ' + MESES[p.m - 1]; };
  var curta = function (s) { if (!s) return ''; var p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };

  var api = { hojePT: hojePT, somaDias: somaDias, mesSeguinte: mesSeguinte, diaDe: diaDe, porExtenso: porExtenso, curta: curta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TNDatas = api;
})(typeof window !== 'undefined' ? window : this);
