#!/usr/bin/env node
/**
 * Parity test for the JS validator core (js/bdsp_validator_core.js).
 *
 * Phase A (always): evaluate every sols/<name>.csv against
 * downloads/instances/<name>.json and compare with the Python-derived
 * solution_breakdown and bks stored in data/instances.json.
 *
 * Phase B (--python): additionally run the bundled Python reference
 * (scripts/py_eval_batch.py over bdsp-validator/) on the same pairs and
 * compare ALL per-employee fields, including the hard-constraint
 * penalty internals. Exact numeric equality, zero tolerance.
 *
 * Usage:
 *   node scripts/parity_test.js [--python] [--python-bin <bin>]
 *                               [--only <name>] [--verbose]
 *
 * Exit code 0 = all pass, 1 = any mismatch.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const core = require(path.join(REPO, 'js', 'bdsp_validator_core.js'));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const opts = { python: false, pythonBin: null, only: null, verbose: false };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--python') opts.python = true;
  else if (argv[i] === '--python-bin') opts.pythonBin = argv[++i];
  else if (argv[i] === '--only') opts.only = argv[++i];
  else if (argv[i] === '--verbose') opts.verbose = true;
  else {
    console.error('Unknown argument: ' + argv[i]);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_DIFFS_PER_INSTANCE = 5;

function loadInstance(name) {
  const jsonPath = path.join(REPO, 'downloads', 'instances', name + '.json');
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return core.parseInstance(json, name);
}

function evaluateSolutionFile(instance, csvPath) {
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const employees = core.parseSolution(csvText, instance);
  const result = core.evaluateSolution(instance, employees);
  result.legCheck = core.validateLegs(instance, employees);
  return result;
}

/** Fields of the JS state compared against the stored solution_breakdown. */
const STORED_FIELDS = [
  ['work_time_paid', 'work_time_paid'],
  ['total_time', 'total_time'],
  ['ride', 'ride'],
  ['vehicle_changes', 'vehicle_changes'],
  ['split_shifts', 'split_shifts'],
  ['drive_time', 'drive_time'],
  ['num_legs', 'num_legs'],
];

/** Fields compared against the live Python reference (py_eval_batch.py). */
const PYTHON_FIELDS = [
  'total_cost', 'objective', 'work_time_paid', 'total_time', 'ride',
  'vehicle_changes', 'split_shifts', 'drive_time', 'bus_penalty',
  'drive_penalty', 'rest_penalty', 'work_time', 'unpaid', 'upmax', 'num_legs',
];

/** All numeric values the JS core produces must be exact integers. */
const INTEGER_FIELDS = [
  'total_cost', 'objective', 'work_time_paid', 'total_time', 'ride',
  'vehicle_changes', 'split_shifts', 'drive_time', 'bus_penalty',
  'drive_penalty', 'rest_penalty', 'work_time', 'unpaid', 'upmax',
  'num_legs', 'hard',
];

function checkIntegers(name, evaluated, diffs) {
  evaluated.forEach(function (ev) {
    INTEGER_FIELDS.forEach(function (f) {
      if (!Number.isInteger(ev.state[f])) {
        diffs.push(name + ' ' + ev.emp.name + ': ' + f + ' is not an integer (' + ev.state[f] + ')');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Collect test cases
// ---------------------------------------------------------------------------

const instancesData = JSON.parse(
  fs.readFileSync(path.join(REPO, 'data', 'instances.json'), 'utf8'));
const byName = {};
instancesData.forEach(function (e) { byName[e.name] = e; });

let names = fs.readdirSync(path.join(REPO, 'sols'))
  .filter(function (f) { return f.endsWith('.csv'); })
  .map(function (f) { return f.replace(/\.csv$/, ''); })
  .sort();
if (opts.only) names = names.filter(function (n) { return n === opts.only; });

if (!names.length) {
  console.error('No solution files matched.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Phase A: JS core vs stored breakdowns
// ---------------------------------------------------------------------------

console.log('Phase A: JS core vs stored solution_breakdown (' + names.length + ' instances)');

let failures = 0;
const jsResults = {}; // name -> {result, instance}
const bksMismatches = [];

names.forEach(function (name) {
  const diffs = [];
  const entry = byName[name];
  if (!entry) {
    console.log('FAIL ' + name + ': not present in data/instances.json');
    failures++;
    return;
  }

  let instance, result;
  try {
    instance = loadInstance(name);
    result = evaluateSolutionFile(instance, path.join(REPO, 'sols', name + '.csv'));
  } catch (err) {
    console.log('FAIL ' + name + ': ' + err.message);
    failures++;
    return;
  }
  jsResults[name] = { result: result, instance: instance };

  checkIntegers(name, result.evaluated, diffs);

  const stored = entry.solution_breakdown;
  if (!stored) {
    diffs.push('no solution_breakdown stored');
  } else {
    if (result.totalCost !== stored.total_objective) {
      diffs.push('total: js=' + result.totalCost + ' stored=' + stored.total_objective);
    }
    // The recorded bks comes from algorithm result tables and may be lower
    // than the best archived solution matrix — a data caveat, not a
    // validator divergence. Warn, don't fail.
    if (entry.bks != null && result.totalCost !== Number(entry.bks)) {
      bksMismatches.push(name + ': solution file total=' + result.totalCost + ' recorded bks=' + entry.bks);
    }
    if (result.allFeasible !== stored.feasible) {
      diffs.push('feasible: js=' + result.allFeasible + ' stored=' + stored.feasible);
    }
    if (result.evaluated.length !== stored.num_employees) {
      diffs.push('num_employees: js=' + result.evaluated.length + ' stored=' + stored.num_employees);
    } else {
      result.evaluated.forEach(function (ev, i) {
        const ref = stored.employees[i];
        // Stored per-employee "objective" comes from Python Employee.objective,
        // which is hard + soft — i.e. the JS state's total_cost.
        if (ev.state.total_cost !== ref.objective) {
          diffs.push(ev.emp.name + '.objective: js total_cost=' + ev.state.total_cost + ' stored=' + ref.objective);
        }
        if (ref.feasible && ev.state.objective !== ev.state.total_cost) {
          diffs.push(ev.emp.name + ': feasible but soft objective ' + ev.state.objective + ' != total_cost ' + ev.state.total_cost);
        }
        if (ev.state.feasible !== ref.feasible) {
          diffs.push(ev.emp.name + '.feasible: js=' + ev.state.feasible + ' stored=' + ref.feasible);
        }
        STORED_FIELDS.forEach(function (pair) {
          if (ev.state[pair[0]] !== ref[pair[1]]) {
            diffs.push(ev.emp.name + '.' + pair[1] + ': js=' + ev.state[pair[0]] + ' stored=' + ref[pair[1]]);
          }
        });
      });
    }
  }
  if (result.legCheck.unassigned.length || result.legCheck.duplicates.length) {
    diffs.push('coverage: ' + result.legCheck.unassigned.length + ' unassigned, ' +
      result.legCheck.duplicates.length + ' duplicated');
  }

  if (diffs.length) {
    failures++;
    console.log('FAIL ' + name);
    diffs.slice(0, MAX_DIFFS_PER_INSTANCE).forEach(function (d) { console.log('  ' + d); });
    if (diffs.length > MAX_DIFFS_PER_INSTANCE) {
      console.log('  ... and ' + (diffs.length - MAX_DIFFS_PER_INSTANCE) + ' more');
    }
  } else if (opts.verbose) {
    console.log('PASS ' + name + ' (total ' + result.totalCost + ')');
  }
});

console.log('Phase A: ' + (names.length - failures) + '/' + names.length + ' passed');
if (bksMismatches.length) {
  console.log('WARN: ' + bksMismatches.length + ' instance(s) where the archived solution file ' +
    'does not reach the recorded bks (data caveat, not a validator issue):');
  bksMismatches.forEach(function (m) { console.log('  ' + m); });
}

// ---------------------------------------------------------------------------
// Phase B: JS core vs live Python reference
// ---------------------------------------------------------------------------

function runPythonBatch(jobs, pythonBin) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdsp-parity-'));
  const manifest = path.join(tmp, 'manifest.jsonl');
  const outFile = path.join(tmp, 'out.jsonl');
  fs.writeFileSync(manifest,
    jobs.map(function (j) { return JSON.stringify(j); }).join('\n') + '\n');

  const candidates = pythonBin ? [pythonBin] : ['python', 'py'];
  let lastError = null;
  for (let c = 0; c < candidates.length; c++) {
    const parts = candidates[c].split(' ');
    const args = parts.slice(1).concat(
      [path.join(REPO, 'scripts', 'py_eval_batch.py'), manifest, outFile]);
    const proc = spawnSync(parts[0], args, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (proc.error) { lastError = proc.error.message; continue; }
    if (proc.status !== 0) { lastError = 'exit code ' + proc.status; continue; }
    const results = {};
    fs.readFileSync(outFile, 'utf8').split('\n').forEach(function (line) {
      if (!line.trim()) return;
      const rec = JSON.parse(line);
      results[rec.id] = rec;
    });
    return results;
  }
  throw new Error('Python reference run failed (' + lastError +
    '). Is sortedcontainers installed? Try --python-bin.');
}

function comparePython(id, jsResult, pyResult, diffs) {
  if (jsResult.totalCost !== pyResult.total) {
    diffs.push('total: js=' + jsResult.totalCost + ' py=' + pyResult.total);
  }
  if (jsResult.allFeasible !== pyResult.feasible) {
    diffs.push('feasible: js=' + jsResult.allFeasible + ' py=' + pyResult.feasible);
  }
  const jsCovered = jsResult.legCheck.unassigned.length === 0 &&
    jsResult.legCheck.duplicates.length === 0;
  if (jsCovered !== pyResult.covered) {
    diffs.push('covered: js=' + jsCovered + ' py=' + pyResult.covered +
      ' (py unassigned=' + pyResult.unassigned + ' duplicates=' + pyResult.duplicates + ')');
  }
  if (jsResult.evaluated.length !== pyResult.num_employees) {
    diffs.push('num_employees: js=' + jsResult.evaluated.length + ' py=' + pyResult.num_employees);
    return;
  }
  jsResult.evaluated.forEach(function (ev, i) {
    const ref = pyResult.employees[i];
    if (ev.state.feasible !== ref.feasible) {
      diffs.push(ev.emp.name + '.feasible: js=' + ev.state.feasible + ' py=' + ref.feasible);
    }
    PYTHON_FIELDS.forEach(function (f) {
      if (ev.state[f] !== ref[f]) {
        diffs.push(ev.emp.name + '.' + f + ': js=' + ev.state[f] + ' py=' + ref[f]);
      }
    });
  });
}

if (opts.python) {
  const jobs = names
    .filter(function (n) { return jsResults[n]; })
    .map(function (n) {
      return {
        id: n,
        instance: path.join(REPO, 'downloads', 'instances', n + '.json'),
        solution: path.join(REPO, 'sols', n + '.csv'),
      };
    });

  console.log('Phase B: JS core vs Python reference (' + jobs.length + ' instances)');
  const pyResults = runPythonBatch(jobs, opts.pythonBin);

  let pyFailures = 0;
  jobs.forEach(function (job) {
    const diffs = [];
    const pyResult = pyResults[job.id];
    if (!pyResult) {
      diffs.push('missing Python result');
    } else {
      comparePython(job.id, jsResults[job.id].result, pyResult, diffs);
    }
    if (diffs.length) {
      pyFailures++;
      console.log('FAIL ' + job.id);
      diffs.slice(0, MAX_DIFFS_PER_INSTANCE).forEach(function (d) { console.log('  ' + d); });
      if (diffs.length > MAX_DIFFS_PER_INSTANCE) {
        console.log('  ... and ' + (diffs.length - MAX_DIFFS_PER_INSTANCE) + ' more');
      }
    } else if (opts.verbose) {
      console.log('PASS ' + job.id);
    }
  });
  console.log('Phase B: ' + (jobs.length - pyFailures) + '/' + jobs.length + ' passed');
  failures += pyFailures;
}

process.exit(failures ? 1 : 0);
