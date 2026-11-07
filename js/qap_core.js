/**
 * QAP Core
 * Pure computation for the QAP pages: parse a QAPLIB instance, parse a
 * permutation, compute its cost. No DOM or browser dependencies; the same
 * cost definition as scripts/build_qap_data.py (checked by
 * scripts/qap_parity_test.js).
 *
 * Loaded by qap_validate.html / qap_instance.html (browser: window.QAP_CORE)
 * and by the parity test (Node: require()).
 */

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.QAP_CORE = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function integers(text) {
    var tokens = String(text).match(/-?\d+/g) || [];
    return tokens.map(Number);
  }

  // ---------------------------------------------------------------------------
  // parseInstance(text) -> { n, a, b }
  // QAPLIB .dat: n, then the n x n matrix a, then the n x n matrix b.
  // ---------------------------------------------------------------------------

  function parseInstance(text) {
    var numbers = integers(text);
    var n = numbers[0];
    if (!(n > 0) || numbers.length !== 1 + 2 * n * n) {
      throw new Error('Not a QAPLIB instance: expected n followed by two n×n matrices.');
    }
    return { n: n, a: numbers.slice(1, 1 + n * n), b: numbers.slice(1 + n * n) };
  }

  // ---------------------------------------------------------------------------
  // parsePermutation(text, n) -> { permutation, zeroBased, headerValue }
  // Accepts a QAPLIB .sln file ("n value" then the permutation) or a bare list
  // of n numbers, separated by spaces, commas or line breaks. A list using
  // 0..n-1 is shifted to 1..n and reported as zeroBased.
  // ---------------------------------------------------------------------------

  function parsePermutation(text, n) {
    var numbers = integers(text);
    var headerValue = null;
    if (numbers.length === n + 2 && numbers[0] === n) {
      headerValue = numbers[1];
      numbers = numbers.slice(2);
    }
    if (numbers.length !== n) {
      throw new Error('Expected ' + n + ' numbers (or an .sln file starting with "' + n +
        ' <value>"), found ' + numbers.length + '.');
    }
    var zeroBased = numbers.indexOf(0) !== -1 && numbers.indexOf(n) === -1;
    var permutation = zeroBased ? numbers.map(function (x) { return x + 1; }) : numbers;
    var problems = permutationProblems(permutation, n);
    if (problems) throw new Error(problems);
    return { permutation: permutation, zeroBased: zeroBased, headerValue: headerValue };
  }

  function permutationProblems(permutation, n) {
    var seen = new Array(n + 1).fill(0);
    var outOfRange = [];
    permutation.forEach(function (x) {
      if (x >= 1 && x <= n) seen[x]++; else outOfRange.push(x);
    });
    var repeated = [], missing = [];
    for (var k = 1; k <= n; k++) {
      if (seen[k] > 1) repeated.push(k);
      if (seen[k] === 0) missing.push(k);
    }
    var parts = [];
    if (outOfRange.length) parts.push('out of range: ' + outOfRange.slice(0, 10).join(', '));
    if (repeated.length) parts.push('repeated: ' + repeated.slice(0, 10).join(', '));
    if (missing.length) parts.push('missing: ' + missing.slice(0, 10).join(', '));
    return parts.length ? 'Not a permutation of 1..' + n + ' (' + parts.join('; ') + ').' : null;
  }

  // ---------------------------------------------------------------------------
  // cost(instance, permutation) = sum_ij a[i][j] * b[p(i)][p(j)]
  // permutation is 1-based: p(i) is the location of facility i.
  // ---------------------------------------------------------------------------

  function cost(instance, permutation) {
    var n = instance.n, a = instance.a, b = instance.b;
    var total = 0;
    for (var i = 0; i < n; i++) {
      var rowB = (permutation[i] - 1) * n;
      for (var j = 0; j < n; j++) {
        total += a[i * n + j] * b[rowB + permutation[j] - 1];
      }
    }
    return total;
  }

  function inverse(permutation) {
    var result = new Array(permutation.length);
    permutation.forEach(function (location, facility) { result[location - 1] = facility + 1; });
    return result;
  }

  // QAPLIB .sln text: "n value" then the permutation, 20 numbers per line.
  function toSln(permutation, value) {
    var lines = [permutation.length + ' ' + value];
    for (var k = 0; k < permutation.length; k += 20) {
      lines.push(permutation.slice(k, k + 20).join(' '));
    }
    return lines.join('\n') + '\n';
  }

  return {
    parseInstance: parseInstance,
    parsePermutation: parsePermutation,
    cost: cost,
    inverse: inverse,
    toSln: toSln
  };
});
