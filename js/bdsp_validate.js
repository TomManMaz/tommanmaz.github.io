/**
 * BDSP Web Solution Validator
 * Client-side validator — ports the Python bdsp-validator logic to vanilla JS.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Globals
  // ---------------------------------------------------------------------------

  var currentInstance = null; // parsed instance object

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatNum(val, decimals) {
    if (val == null) return '\u2014';
    if (decimals !== undefined) return val.toFixed(decimals);
    if (Number.isInteger(val)) return val.toLocaleString('en-US');
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function showStatus(id, msg, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'validator-status ' + (cls || '');
  }

  // ---------------------------------------------------------------------------
  // Populate instance selector
  // ---------------------------------------------------------------------------

  function populateSelector() {
    var select = document.getElementById('instance-select');
    var data = window.BDSP_INSTANCES || [];
    if (!data.length) {
      showStatus('instance-status', 'Instance data not loaded.', 'status-error');
      return;
    }

    // Group by source
    var groups = {};
    var order = [];
    data.forEach(function (inst) {
      var src = inst.source || 'unknown';
      if (!groups[src]) {
        groups[src] = [];
        order.push(src);
      }
      groups[src].push(inst);
    });

    // realistic first, then others sorted
    order.sort(function (a, b) {
      if (a === 'realistic') return -1;
      if (b === 'realistic') return 1;
      return a.localeCompare(b);
    });

    order.forEach(function (src) {
      var optgroup = document.createElement('optgroup');
      optgroup.label = src + ' (' + groups[src].length + ')';
      groups[src].forEach(function (inst) {
        var opt = document.createElement('option');
        opt.value = inst.name;
        opt.textContent = inst.name;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    });

    select.addEventListener('change', onInstanceChange);
  }

  // ---------------------------------------------------------------------------
  // Instance loading
  // ---------------------------------------------------------------------------

  function onInstanceChange() {
    var select = document.getElementById('instance-select');
    var name = select.value;
    currentInstance = null;
    document.getElementById('results-section').style.display = 'none';

    if (!name) {
      showStatus('instance-status', '', '');
      return;
    }

    showStatus('instance-status', 'Loading instance\u2026', 'status-loading');

    var url = 'downloads/instances/' + encodeURIComponent(name) + '.json';
    fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        try {
          currentInstance = parseInstance(json, name);
          showStatus(
            'instance-status',
            'Loaded: ' + currentInstance.legs.length + ' legs, ' +
              currentInstance.numTours + ' tours',
            'status-ok'
          );
        } catch (e) {
          showStatus('instance-status', 'Parse error: ' + e.message, 'status-error');
          currentInstance = null;
        }
      })
      .catch(function (e) {
        showStatus('instance-status', 'Failed to load instance: ' + e.message, 'status-error');
      });
  }

  // ---------------------------------------------------------------------------
  // parseInstance(json, name)
  // ---------------------------------------------------------------------------

  function parseInstance(json, name) {
    // Sort legs by start time, then by original index (matching Python SortedList behaviour)
    var rawLegs = json.legs || [];
    var legs = rawLegs.map(function (item, idx) {
      return {
        id: idx,           // original index in JSON array
        tour: item.tour,
        start: item.start,
        end: item.end,
        startPos: item.startPos,
        endPos: item.endPos,
        drive: item.end - item.start
      };
    });
    // stable sort by start, then id
    legs.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      return a.id - b.id;
    });
    // re-assign sorted index
    legs.forEach(function (leg, idx) { leg.sortedIdx = idx; });

    // Distance matrix — distances is an object keyed by string position indices
    var distRaw = json.distances || {};
    var numPos = Object.keys(distRaw).length;
    var distances = [];
    for (var i = 0; i < numPos; i++) {
      var row = distRaw[String(i)] || {};
      distances[i] = [];
      for (var j = 0; j < numPos; j++) {
        distances[i][j] = row[String(j)] || 0;
      }
    }

    // start/end work times — extra is an object keyed by string position indices
    var extraRaw = json.extra || {};
    var startWork = [];
    var endWork = [];
    var numExtra = Object.keys(extraRaw).length;
    for (var k = 0; k < numExtra; k++) {
      var posData = extraRaw[String(k)] || {};
      startWork[k] = posData.startWork || 0;
      endWork[k] = posData.endWork || 0;
    }

    // Count unique tours
    var tourSet = {};
    legs.forEach(function (l) { tourSet[l.tour] = true; });

    return {
      name: name,
      legs: legs,
      distances: distances,
      startWork: startWork,
      endWork: endWork,
      numTours: Object.keys(tourSet).length
    };
  }

  // ---------------------------------------------------------------------------
  // parseSolution(csvText, instance)
  // Returns array of employee objects: { id, name, legs[] }
  // ---------------------------------------------------------------------------

  function parseSolution(csvText, instance) {
    var lines = csvText.split(/\r?\n/);
    var employees = [];
    var counter = 0;

    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;

      var cols = line.split(',').map(function (v) { return parseFloat(v); });

      // Skip all-zero rows
      if (cols.every(function (v) { return v === 0 || isNaN(v); })) return;

      if (cols.length !== instance.legs.length) {
        throw new Error(
          'Row ' + (counter + 1) + ' has ' + cols.length +
          ' columns but instance has ' + instance.legs.length + ' legs.'
        );
      }

      var assignedLegs = [];
      cols.forEach(function (val, j) {
        if (val === 1) assignedLegs.push(instance.legs[j]);
      });

      // Sort by start, then id (same ordering as SortedList)
      assignedLegs.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        return a.id - b.id;
      });

      employees.push({
        id: counter,
        name: 'E' + counter,
        legs: assignedLegs
      });
      counter++;
    });

    return employees;
  }

  // ---------------------------------------------------------------------------
  // getPassiveRide(distances, i, j)
  // ---------------------------------------------------------------------------

  function getPassiveRide(distances, i, j) {
    if (i === j) return 0;
    return (distances[i] && distances[i][j]) ? distances[i][j] : 0;
  }

  // ---------------------------------------------------------------------------
  // evaluateEmployee(emp, instance)
  // Returns the employee state object.
  // ---------------------------------------------------------------------------

  function evaluateEmployee(emp, instance) {
    var legs = emp.legs;
    var distances = instance.distances;
    var startWork = instance.startWork;
    var endWork = instance.endWork;

    if (!legs.length) {
      return {
        feasible: true,
        objective: 0,
        work_time_paid: 0,
        total_time: 0,
        ride: 0,
        vehicle_changes: 0,
        split_shifts: 0,
        drive_time: 0,
        bus_penalty: 0,
        drive_penalty: 0,
        rest_penalty: 0,
        work_time: 0,
        unpaid: 0,
        upmax: 0,
        split_time: 0,
        start_shift: 0,
        end_shift: 0,
        hard: 0,
        total_cost: 0,
        num_legs: 0
      };
    }

    // --- Step 1: Leg-pair variables ---
    var legVars = []; // {leg_i, leg_j, i, j, ride, diff, diff_1}
    for (var k = 0; k < legs.length - 1; k++) {
      var leg_i = legs[k];
      var leg_j = legs[k + 1];
      var i = leg_i.endPos;
      var j = leg_j.startPos;
      var ride = getPassiveRide(distances, i, j);
      var diff = leg_j.start - leg_i.end;
      var diff_1 = diff - ride;
      legVars.push({ leg_i: leg_i, leg_j: leg_j, i: i, j: j, ride: ride, diff: diff, diff_1: diff_1 });
    }

    // --- Step 2: Shift boundaries ---
    var firstLeg = legs[0];
    var lastLeg = legs[legs.length - 1];
    var start_shift = firstLeg.start - (startWork[firstLeg.startPos] || 0);
    var end_shift = lastLeg.end + (endWork[lastLeg.endPos] || 0);
    var total_time = end_shift - start_shift;

    // --- Step 3: Drive & ride time ---
    var drive_time = 0;
    legs.forEach(function (l) { drive_time += l.drive; });

    var ride = 0;
    legVars.forEach(function (lv) { ride += lv.ride; });

    // --- Step 4: Bus penalty ---
    var bus_penalty = 0;
    legVars.forEach(function (lv) {
      var leg_i = lv.leg_i, leg_j = lv.leg_j;
      if (leg_i.tour !== leg_j.tour || leg_i.endPos !== leg_j.startPos) {
        var dist = distances[lv.i] && distances[lv.i][lv.j] ? distances[lv.i][lv.j] : 0;
        if (lv.diff < dist) {
          bus_penalty += Math.abs(lv.diff - dist);
        } else if (lv.diff <= 0) {
          bus_penalty += Math.abs(lv.diff);
        }
      }
    });

    // --- Step 5: Vehicle changes ---
    var vehicle_changes = 0;
    legVars.forEach(function (lv) {
      if (lv.leg_i.tour !== lv.leg_j.tour) vehicle_changes++;
    });

    // --- Step 6: Drive block penalty ---
    var drive_penalty = 0;
    var b_20 = 0;
    var b_15 = 0;
    var dc = legs[0].drive;
    legVars.forEach(function (lv) {
      var diff = lv.diff;
      var new_block = (diff >= 30) || (diff >= 20 && b_20 === 1) || (diff >= 15 && b_15 === 2);
      if (new_block) {
        dc = lv.leg_j.drive;
        b_20 = 0;
        b_15 = 0;
      } else {
        dc += lv.leg_j.drive;
        if (diff >= 20) b_20 = 1;
        if (diff >= 15) b_15++;
      }
      if (dc >= 240) {
        drive_penalty += (dc - 240);
      }
    });

    // --- Step 7: Working regulations ---

    // first15: any diff_1 >= 15 within first 6h of work (skipping splits >= 180)
    var first15 = false;
    var split_time_for_first15 = 0;
    for (var m = 0; m < legVars.length; m++) {
      var lv = legVars[m];
      if (lv.diff_1 >= 180) {
        split_time_for_first15 += lv.diff_1;
        continue;
      }
      if (lv.diff_1 >= 15 && lv.leg_i.end <= start_shift + 6 * 60 + split_time_for_first15) {
        first15 = true;
        break;
      }
    }

    // break30: any diff_1 >= 30 (skipping splits >= 180)
    var break30 = false;
    for (var m2 = 0; m2 < legVars.length; m2++) {
      var lv2 = legVars[m2];
      if (lv2.diff_1 >= 180) continue;
      if (lv2.diff_1 >= 30) { break30 = true; break; }
    }

    // unpaid & center30
    var unpaid = 0;
    var center30 = false;
    legVars.forEach(function (lv) {
      if (lv.diff_1 >= 180) return; // skip splits
      var breakEnd = Math.min(end_shift - 2 * 60, lv.leg_j.start - lv.ride);
      var breakStart = Math.max(start_shift + 2 * 60, lv.leg_i.end);
      if (breakEnd - breakStart >= 15) {
        unpaid += breakEnd - breakStart;
      }
      // center30 check
      var centerEnd = Math.min(end_shift - 3 * 60, lv.leg_j.start - lv.ride);
      var centerStart = Math.max(start_shift + 3 * 60, lv.leg_i.end);
      if (centerEnd - centerStart >= 30) {
        center30 = true;
      }
    });

    // upmax
    var upmax = 0;
    if (!break30 || !first15) {
      upmax = 0;
    } else if (center30) {
      upmax = 90;
    } else {
      upmax = 60;
    }

    // split
    var split_shifts = 0;
    var split_time = 0;
    legVars.forEach(function (lv) {
      if (lv.diff_1 >= 180) {
        split_shifts++;
        split_time += lv.diff_1;
      }
    });

    // --- Step 8: Work time ---
    var work_time = total_time - split_time - Math.min(unpaid, upmax);

    // --- Step 9: Rest penalty ---
    var rest_penalty = 0;
    if (work_time >= 6 * 60) {
      var rest_time = 0;
      if (break30 && first15) {
        legVars.forEach(function (lv) {
          if (lv.diff_1 >= 3 * 60) return;
          if (lv.diff_1 >= 15) rest_time += lv.diff_1;
        });
      }
      if (rest_time < 30) {
        rest_penalty = Math.max(0, work_time - (6 * 60 - 1));
      } else if (rest_time < 45) {
        rest_penalty = Math.max(0, work_time - 9 * 60);
      }
    }

    // --- Step 10: Objective ---
    var actual_work_time = Math.max(work_time, 390);
    var objective = 2 * actual_work_time + total_time + ride + 30 * vehicle_changes + 180 * split_shifts;

    // --- Step 11: Hard constraints ---
    var hard = 1000 * (
      bus_penalty +
      Math.max(drive_time - 540, 0) +
      Math.max(total_time - 840, 0) +
      drive_penalty +
      rest_penalty +
      Math.max(work_time - 600, 0)
    );

    var feasible = (hard === 0);
    var total_cost = hard + objective;

    return {
      feasible: feasible,
      objective: objective,
      work_time_paid: actual_work_time,
      total_time: total_time,
      ride: ride,
      vehicle_changes: vehicle_changes,
      split_shifts: split_shifts,
      drive_time: drive_time,
      bus_penalty: bus_penalty,
      drive_penalty: drive_penalty,
      rest_penalty: rest_penalty,
      work_time: work_time,
      unpaid: unpaid,
      upmax: upmax,
      split_time: split_time,
      start_shift: start_shift,
      end_shift: end_shift,
      hard: hard,
      total_cost: total_cost,
      num_legs: legs.length
    };
  }

  // ---------------------------------------------------------------------------
  // validateLegs(instance, employees)
  // Returns { unassigned, duplicates }
  // ---------------------------------------------------------------------------

  function validateLegs(instance, employees) {
    var counts = {}; // legSortedIdx -> count
    instance.legs.forEach(function (leg) { counts[leg.sortedIdx] = 0; });

    employees.forEach(function (emp) {
      emp.legs.forEach(function (leg) {
        if (counts[leg.sortedIdx] === undefined) counts[leg.sortedIdx] = 0;
        counts[leg.sortedIdx]++;
      });
    });

    var unassigned = [];
    var duplicates = [];
    instance.legs.forEach(function (leg) {
      var c = counts[leg.sortedIdx] || 0;
      if (c === 0) unassigned.push(leg);
      else if (c > 1) duplicates.push({ leg: leg, count: c });
    });

    return { unassigned: unassigned, duplicates: duplicates };
  }

  // ---------------------------------------------------------------------------
  // renderResults
  // ---------------------------------------------------------------------------

  function renderResults(instance, employees, legCheck) {
    var resultsSection = document.getElementById('results-section');
    var container = document.getElementById('results-content');

    var evaluated = employees.map(function (emp) {
      var state = evaluateEmployee(emp, instance);
      return { emp: emp, state: state };
    });

    var totalObjective = 0;
    var allFeasible = true;
    evaluated.forEach(function (ev) {
      totalObjective += ev.state.total_cost;
      if (!ev.state.feasible) allFeasible = false;
    });

    var html = '';

    // Summary bar
    html += '<div class="breakdown-summary">';
    html += '<span><strong>Employees:</strong> ' + evaluated.length + '</span>';
    html += '<span><strong>Total cost:</strong> ' + formatNum(totalObjective) + '</span>';
    var feasClass = allFeasible ? 'badge-optimal' : 'badge-open';
    var feasText = allFeasible ? 'Feasible' : 'Infeasible';
    html += '<span class="status-badge ' + feasClass + '">' + feasText + '</span>';

    // Leg coverage
    if (legCheck.unassigned.length === 0 && legCheck.duplicates.length === 0) {
      html += '<span class="leg-coverage leg-coverage-ok">\u2713 All ' + instance.legs.length + ' legs covered</span>';
    } else {
      if (legCheck.unassigned.length > 0) {
        html += '<span class="leg-coverage leg-coverage-warn">\u26a0 ' + legCheck.unassigned.length + ' leg(s) unassigned</span>';
      }
      if (legCheck.duplicates.length > 0) {
        html += '<span class="leg-coverage leg-coverage-warn">\u26a0 ' + legCheck.duplicates.length + ' leg(s) assigned multiple times</span>';
      }
    }
    html += '</div>';

    // Objective formula
    html += '<div class="obj-formula">';
    html += 'Obj<sub>e</sub> = 2 &middot; W\u2032 + T + ride + 30 &middot; changes + 180 &middot; splits';
    html += '<span class="formula-note">where W\u2032 = max(work_time, 390); infeasible employees additionally incur 1000&times; hard-constraint penalties</span>';
    html += '</div>';

    // Per-employee breakdown table
    html += '<div style="overflow-x:auto;">';
    html += '<table class="algo-table breakdown-table">';
    html += '<thead><tr>';
    html += '<th>Employee</th><th>Cost</th><th>Obj</th><th>W\u2032</th><th>T</th><th>Ride</th>';
    html += '<th>Changes</th><th>Splits</th><th>Drive</th><th>Legs</th><th>Feasible</th>';
    html += '</tr></thead><tbody>';

    evaluated.forEach(function (ev) {
      var s = ev.state;
      var rowClass = s.feasible ? '' : ' class="infeasible-row"';
      html += '<tr' + rowClass + '>';
      html += '<td>' + escapeHtml(ev.emp.name) + '</td>';
      html += '<td>' + formatNum(s.total_cost) + '</td>';
      html += '<td>' + formatNum(s.objective) + '</td>';
      html += '<td>' + formatNum(s.work_time_paid) + '</td>';
      html += '<td>' + formatNum(s.total_time) + '</td>';
      html += '<td>' + formatNum(s.ride) + '</td>';
      html += '<td>' + s.vehicle_changes + '</td>';
      html += '<td>' + s.split_shifts + '</td>';
      html += '<td>' + formatNum(s.drive_time) + '</td>';
      html += '<td>' + s.num_legs + '</td>';
      var fIcon = s.feasible ? '\u2713' : '\u2717';
      html += '<td class="' + (s.feasible ? 'feasible-icon' : 'infeasible-icon') + '">' + fIcon + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Leg coverage details (if issues)
    if (legCheck.unassigned.length > 0 || legCheck.duplicates.length > 0) {
      html += '<div class="leg-coverage-detail">';
      if (legCheck.unassigned.length > 0) {
        html += '<p><strong>Unassigned legs:</strong> ';
        html += legCheck.unassigned.slice(0, 20).map(function (l) {
          return 'leg ' + l.sortedIdx + ' (tour ' + l.tour + ', ' + l.start + '\u2013' + l.end + ')';
        }).join(', ');
        if (legCheck.unassigned.length > 20) html += ', \u2026';
        html += '</p>';
      }
      if (legCheck.duplicates.length > 0) {
        html += '<p><strong>Duplicated legs:</strong> ';
        html += legCheck.duplicates.slice(0, 20).map(function (d) {
          return 'leg ' + d.leg.sortedIdx + ' (' + d.count + 'x)';
        }).join(', ');
        if (legCheck.duplicates.length > 20) html += ', \u2026';
        html += '</p>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Validate button handler
  // ---------------------------------------------------------------------------

  function onValidate() {
    var fileInput = document.getElementById('solution-upload');
    var validateBtn = document.getElementById('validate-btn');
    var solutionStatus = document.getElementById('solution-status');

    if (!currentInstance) {
      showStatus('solution-status', 'Please select and load an instance first.', 'status-error');
      return;
    }

    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      showStatus('solution-status', 'Please choose a solution CSV file.', 'status-error');
      return;
    }

    validateBtn.disabled = true;
    showStatus('solution-status', 'Validating\u2026', 'status-loading');
    document.getElementById('results-section').style.display = 'none';

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var employees = parseSolution(e.target.result, currentInstance);
        if (!employees.length) {
          showStatus('solution-status', 'No employees found in CSV (all rows were empty).', 'status-error');
          validateBtn.disabled = false;
          return;
        }
        var legCheck = validateLegs(currentInstance, employees);
        renderResults(currentInstance, employees, legCheck);
        showStatus('solution-status', 'Validation complete — ' + employees.length + ' employee(s).', 'status-ok');
      } catch (err) {
        showStatus('solution-status', 'Error: ' + err.message, 'status-error');
        document.getElementById('results-section').style.display = 'none';
      }
      validateBtn.disabled = false;
    };
    reader.onerror = function () {
      showStatus('solution-status', 'Failed to read file.', 'status-error');
      validateBtn.disabled = false;
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    populateSelector();

    var validateBtn = document.getElementById('validate-btn');
    if (validateBtn) validateBtn.addEventListener('click', onValidate);

    // Also trigger instance load if a value is pre-selected (e.g. via URL param)
    var params = new URLSearchParams(window.location.search);
    var preselect = params.get('instance');
    if (preselect) {
      var select = document.getElementById('instance-select');
      if (select) {
        select.value = preselect;
        if (select.value === preselect) onInstanceChange();
      }
    }
  });

})();
