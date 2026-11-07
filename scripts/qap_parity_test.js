#!/usr/bin/env node
/**
 * QAP parity test: the JS core (js/qap_core.js) must give every published
 * best known value for the stored permutations, exactly as the Python build
 * (scripts/build_qap_data.py) does. Also exercises the permutation parser.
 *
 *   node scripts/qap_parity_test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var core = require('../js/qap_core.js');

var ROOT = path.join(__dirname, '..');
var data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/qap_instances.json'), 'utf8'));
var failures = 0;

function fail(message) {
  failures++;
  console.log('FAIL ' + message);
}

data.instances.forEach(function (entry) {
  var instance = core.parseInstance(fs.readFileSync(path.join(ROOT, entry.instance_url), 'utf8'));
  var parsed = core.parsePermutation(fs.readFileSync(path.join(ROOT, entry.solution_url), 'utf8'), instance.n);
  var value = core.cost(instance, parsed.permutation);
  if (value !== entry.bks) fail(entry.name + ': JS cost ' + value + ' != bks ' + entry.bks);
  if (parsed.headerValue !== entry.bks) fail(entry.name + ': .sln header ' + parsed.headerValue);
});

function expectError(text, n, label) {
  try {
    core.parsePermutation(text, n);
    fail('parser accepted ' + label);
  } catch (e) { /* expected */ }
}

var zeroBased = core.parsePermutation('2 0 1', 3);
if (!zeroBased.zeroBased || zeroBased.permutation.join() !== '3,1,2') fail('0-based list not shifted');
if (core.parsePermutation('(3, 1, 2)', 3).permutation.join() !== '3,1,2') fail('bracketed list');
if (core.inverse([3, 1, 2]).join() !== '2,3,1') fail('inverse');
expectError('1 2 2', 3, 'a repeated location');
expectError('1 2', 3, 'a short list');
expectError('1 2 4', 3, 'an out-of-range location');

console.log(data.instances.length + ' instances checked, ' + failures + ' failure(s)');
process.exit(failures ? 1 : 0);
