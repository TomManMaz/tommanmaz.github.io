#!/usr/bin/env node
/**
 * Differential fuzzing of the JS validator core against the Python reference.
 *
 * The 65 archived solutions are all feasible, so the hard-constraint penalty
 * branches (bus_penalty, drive_penalty, rest_penalty, drive/total/work
 * overruns) are never exercised by parity_test.js alone. This script mutates
 * known-good solutions deterministically, evaluates each mutant with BOTH
 * implementations, and requires exact agreement on every field. It also
 * asserts that every penalty branch was actually triggered at least once.
 *
 * Usage:
 *   node scripts/fuzz_parity.js [--seed 42] [--per-instance 12]
 *                               [--max-legs 800] [--all]
 *                               [--python-bin <bin>] [--keep-failures]
 *
 * Exit code 0 = all mutants agree and all penalty buckets are non-empty.
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
const opts = {
  seed: 42, perInstance: 12, maxLegs: 800, all: false,
  pythonBin: null, keepFailures: false,
};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--seed') opts.seed = parseInt(argv[++i], 10);
  else if (argv[i] === '--per-instance') opts.perInstance = parseInt(argv[++i], 10);
  else if (argv[i] === '--max-legs') opts.maxLegs = parseInt(argv[++i], 10);
  else if (argv[i] === '--all') opts.all = true;
  else if (argv[i] === '--python-bin') opts.pythonBin = argv[++i];
  else if (argv[i] === '--keep-failures') opts.keepFailures = true;
  else {
    console.error('Unknown argument: ' + argv[i]);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(opts.seed);
function randInt(n) { return Math.floor(rand() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }

// ---------------------------------------------------------------------------
// Mutation operators — work on an assignment: Array<Array<sortedIdx>>
// (per-employee lists of leg column indices). All except dup/drop preserve
// exactly-once coverage, so cost differences isolate employee evaluation.
// ---------------------------------------------------------------------------

function cloneAssignment(assignment) {
  return assignment.map(function (legs) { return legs.slice(); });
}

function nonEmpty(assignment) {
  const idx = [];
  assignment.forEach(function (legs, i) { if (legs.length) idx.push(i); });
  return idx;
}

function opMove(assignment) {
  const from = pick(nonEmpty(assignment));
  let to = randInt(assignment.length);
  if (to === from) to = (to + 1) % assignment.length;
  const li = randInt(assignment[from].length);
  assignment[to].push(assignment[from].splice(li, 1)[0]);
}

function opSwap(assignment) {
  const candidates = nonEmpty(assignment);
  if (candidates.length < 2) { opMove(assignment); return; }
  const a = pick(candidates);
  let b = pick(candidates);
  if (b === a) b = candidates[(candidates.indexOf(a) + 1) % candidates.length];
  const ai = randInt(assignment[a].length);
  const bi = randInt(assignment[b].length);
  const tmp = assignment[a][ai];
  assignment[a][ai] = assignment[b][bi];
  assignment[b][bi] = tmp;
}

function opMerge(assignment) {
  const candidates = nonEmpty(assignment);
  if (candidates.length < 2) { opMove(assignment); return; }
  const a = pick(candidates);
  let b = pick(candidates);
  if (b === a) b = candidates[(candidates.indexOf(a) + 1) % candidates.length];
  assignment[a] = assignment[a].concat(assignment[b]);
  assignment[b] = [];
}

function opShuffleK(assignment) {
  const k = 3 + randInt(6); // 3..8
  for (let n = 0; n < k; n++) opMove(assignment);
}

const OPERATORS = [
  ['move', opMove], ['swap', opSwap], ['merge', opMerge], ['shuffle', opShuffleK],
];

function mutate(base) {
  const assignment = cloneAssignment(base);
  const nOps = 1 + randInt(3);
  const trace = [];
  for (let n = 0; n < nOps; n++) {
    const op = pick(OPERATORS);
    trace.push(op[0]);
    op[1](assignment);
  }
  return { assignment: assignment, trace: trace.join('+') };
}

/** Coverage violators: duplicate one assigned leg / drop one assigned leg. */
function mutateDup(base) {
  const assignment = cloneAssignment(base);
  const from = pick(nonEmpty(assignment));
  let to = randInt(assignment.length);
  if (to === from) to = (to + 1) % assignment.length;
  assignment[to].push(pick(assignment[from]));
  return { assignment: assignment, trace: 'dup' };
}

function mutateDrop(base) {
  const assignment = cloneAssignment(base);
  const from = pick(nonEmpty(assignment));
  assignment[from].splice(randInt(assignment[from].length), 1);
  return { assignment: assignment, trace: 'drop' };
}

function assignmentToCsv(assignment, numLegs) {
  return assignment.map(function (legs) {
    const row = new Array(numLegs).fill(0);
    legs.forEach(function (idx) { row[idx] = 1; });
    return row.join(',');
  }).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Build mutants
// ---------------------------------------------------------------------------

const names = fs.readdirSync(path.join(REPO, 'sols'))
  .filter(function (f) { return f.endsWith('.csv'); })
  .map(function (f) { return f.replace(/\.csv$/, ''); })
  .sort();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdsp-fuzz-'));
const failDir = path.join(tmp, 'failures');
const jobs = [];        // {id, instance, solution, name, trace}
const instances = {};   // name -> parsed instance

let skipped = 0;
names.forEach(function (name) {
  const instPath = path.join(REPO, 'downloads', 'instances', name + '.json');
  const instance = core.parseInstance(
    JSON.parse(fs.readFileSync(instPath, 'utf8')), name);
  if (!opts.all && instance.legs.length > opts.maxLegs) { skipped++; return; }
  instances[name] = instance;

  const csvText = fs.readFileSync(path.join(REPO, 'sols', name + '.csv'), 'utf8');
  const employees = core.parseSolution(csvText, instance);
  const base = employees.map(function (emp) {
    return emp.legs.map(function (leg) { return leg.sortedIdx; });
  });

  const mutants = [];
  for (let m = 0; m < opts.perInstance; m++) mutants.push(mutate(base));
  mutants.push(mutateDup(base));
  mutants.push(mutateDrop(base));

  mutants.forEach(function (mut, m) {
    const id = name + '#' + m + '(' + mut.trace + ')';
    const solPath = path.join(tmp, name + '_m' + m + '.csv');
    fs.writeFileSync(solPath, assignmentToCsv(mut.assignment, instance.legs.length));
    jobs.push({ id: id, instance: instPath, solution: solPath, name: name, trace: mut.trace });
  });
});

if (skipped) {
  console.log('Skipped ' + skipped + ' instance(s) with more than ' + opts.maxLegs +
    ' legs (use --all to include them).');
}
console.log('Fuzzing ' + Object.keys(instances).length + ' instances, ' +
  jobs.length + ' mutants (seed ' + opts.seed + ')');

// ---------------------------------------------------------------------------
// JS evaluation + penalty branch tally
// ---------------------------------------------------------------------------

const BUCKETS = {
  'bus_penalty>0': function (s) { return s.bus_penalty > 0; },
  'drive_penalty>0': function (s) { return s.drive_penalty > 0; },
  'rest_penalty>0': function (s) { return s.rest_penalty > 0; },
  'drive_time>540': function (s) { return s.drive_time > 540; },
  'total_time>840': function (s) { return s.total_time > 840; },
  'work_time>600': function (s) { return s.work_time > 600; },
};
const bucketCounts = {};
Object.keys(BUCKETS).forEach(function (k) { bucketCounts[k] = 0; });

const jsResults = {}; // id -> {result}
jobs.forEach(function (job) {
  const instance = instances[job.name];
  const employees = core.parseSolution(fs.readFileSync(job.solution, 'utf8'), instance);
  const result = core.evaluateSolution(instance, employees);
  result.legCheck = core.validateLegs(instance, employees);
  jsResults[job.id] = result;
  result.evaluated.forEach(function (ev) {
    Object.keys(BUCKETS).forEach(function (k) {
      if (BUCKETS[k](ev.state)) bucketCounts[k]++;
    });
  });
});

// ---------------------------------------------------------------------------
// Python reference run (single batch)
// ---------------------------------------------------------------------------

function runPythonBatch(jobList, pythonBin) {
  const manifest = path.join(tmp, 'manifest.jsonl');
  const outFile = path.join(tmp, 'out.jsonl');
  fs.writeFileSync(manifest, jobList.map(function (j) {
    return JSON.stringify({ id: j.id, instance: j.instance, solution: j.solution });
  }).join('\n') + '\n');

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

console.log('Running Python reference on ' + jobs.length + ' mutants…');
const pyResults = runPythonBatch(jobs, opts.pythonBin);

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

const COMPARE_FIELDS = [
  'total_cost', 'objective', 'work_time_paid', 'total_time', 'ride',
  'vehicle_changes', 'split_shifts', 'drive_time', 'bus_penalty',
  'drive_penalty', 'rest_penalty', 'work_time', 'unpaid', 'upmax', 'num_legs',
];

let failures = 0;
jobs.forEach(function (job) {
  const diffs = [];
  const js = jsResults[job.id];
  const py = pyResults[job.id];
  if (!py) {
    diffs.push('missing Python result');
  } else {
    if (js.totalCost !== py.total) diffs.push('total: js=' + js.totalCost + ' py=' + py.total);
    if (js.allFeasible !== py.feasible) diffs.push('feasible: js=' + js.allFeasible + ' py=' + py.feasible);
    const jsCovered = js.legCheck.unassigned.length === 0 && js.legCheck.duplicates.length === 0;
    if (jsCovered !== py.covered) {
      diffs.push('covered: js=' + jsCovered + ' py=' + py.covered);
    }
    if (js.legCheck.unassigned.length !== py.unassigned) {
      diffs.push('unassigned: js=' + js.legCheck.unassigned.length + ' py=' + py.unassigned);
    }
    if (js.legCheck.duplicates.length !== py.duplicates) {
      diffs.push('duplicates: js=' + js.legCheck.duplicates.length + ' py=' + py.duplicates);
    }
    if (js.evaluated.length !== py.num_employees) {
      diffs.push('num_employees: js=' + js.evaluated.length + ' py=' + py.num_employees);
    } else {
      js.evaluated.forEach(function (ev, i) {
        const ref = py.employees[i];
        if (ev.state.feasible !== ref.feasible) {
          diffs.push(ev.emp.name + '.feasible: js=' + ev.state.feasible + ' py=' + ref.feasible);
        }
        COMPARE_FIELDS.forEach(function (f) {
          if (ev.state[f] !== ref[f]) {
            diffs.push(ev.emp.name + '.' + f + ': js=' + ev.state[f] + ' py=' + ref[f]);
          }
        });
      });
    }
  }

  if (diffs.length) {
    failures++;
    console.log('FAIL ' + job.id);
    diffs.slice(0, 8).forEach(function (d) { console.log('  ' + d); });
    if (diffs.length > 8) console.log('  ... and ' + (diffs.length - 8) + ' more');
    if (opts.keepFailures) {
      if (!fs.existsSync(failDir)) fs.mkdirSync(failDir);
      fs.copyFileSync(job.solution, path.join(failDir, path.basename(job.solution)));
    }
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\nPenalty branch coverage (employee evaluations that triggered each branch):');
let emptyBuckets = 0;
Object.keys(bucketCounts).forEach(function (k) {
  const flag = bucketCounts[k] === 0 ? '  <-- NEVER TRIGGERED' : '';
  if (bucketCounts[k] === 0) emptyBuckets++;
  console.log('  ' + k + ': ' + bucketCounts[k] + flag);
});

console.log('\n' + (jobs.length - failures) + '/' + jobs.length + ' mutants agree');
if (failures && opts.keepFailures) {
  console.log('Failing mutant CSVs kept in ' + failDir);
}
if (emptyBuckets) {
  console.log('ERROR: ' + emptyBuckets + ' penalty branch(es) never triggered — ' +
    'increase --per-instance or adjust operators.');
}

process.exit(failures || emptyBuckets ? 1 : 0);
