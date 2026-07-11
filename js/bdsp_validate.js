/**
 * BDSP Web Solution Validator — page logic.
 * All computation lives in js/bdsp_validator_core.js (window.BDSP_VALIDATOR_CORE),
 * which must be loaded before this script. This file only handles DOM and rendering.
 */

(function () {
  'use strict';

  var core = window.BDSP_VALIDATOR_CORE;

  // ---------------------------------------------------------------------------
  // Globals
  // ---------------------------------------------------------------------------

  var currentInstance = null; // parsed instance object
  var currentBKS = null;      // BKS metadata from BDSP_INSTANCES
  var loadToken = 0;          // guards against slow loads finishing out of order

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
    if (val == null) return '—';
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

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
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
    var token = ++loadToken;
    currentInstance = null;
    document.getElementById('results-section').style.display = 'none';

    // Selecting from the collection replaces any uploaded custom instance
    var upload = document.getElementById('instance-upload');
    if (upload) upload.value = '';

    if (!name) {
      showStatus('instance-status', '', '');
      currentBKS = null;
      return;
    }

    // Look up metadata from the pre-loaded collection
    var data = window.BDSP_INSTANCES || [];
    currentBKS = null;
    for (var i = 0; i < data.length; i++) {
      if (data[i].name === name) { currentBKS = data[i]; break; }
    }

    showStatus('instance-status', 'Loading instance…', 'status-loading');

    var url = 'downloads/instances/' + encodeURIComponent(name) + '.json';
    fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        if (token !== loadToken) return; // a newer load superseded this one
        try {
          currentInstance = core.parseInstance(json, name);
          var statusMsg = 'Loaded: ' + currentInstance.legs.length + ' legs, ' +
            currentInstance.numTours + ' tours';
          if (currentBKS && currentBKS.bks != null) {
            statusMsg += ' — BKS: ' + currentBKS.bks.toLocaleString('en-US');
            if (currentBKS.status === 'optimal') statusMsg += ' (optimal)';
          }
          showStatus('instance-status', statusMsg, 'status-ok');
        } catch (e) {
          showStatus('instance-status', 'Parse error: ' + e.message, 'status-error');
          currentInstance = null;
        }
      })
      .catch(function (e) {
        if (token !== loadToken) return;
        showStatus('instance-status', 'Failed to load instance: ' + e.message, 'status-error');
      });
  }

  // ---------------------------------------------------------------------------
  // Custom instance upload (researcher-provided instance JSON)
  // ---------------------------------------------------------------------------

  function onInstanceUpload() {
    var input = document.getElementById('instance-upload');
    var file = input.files && input.files[0];
    if (!file) return;

    var token = ++loadToken;
    var select = document.getElementById('instance-select');
    if (select) select.value = '';
    currentInstance = null;
    currentBKS = null; // no BKS comparison for custom instances
    document.getElementById('results-section').style.display = 'none';

    showStatus('instance-status', 'Reading instance…', 'status-loading');

    var reader = new FileReader();
    reader.onload = function (e) {
      if (token !== loadToken) return; // a newer load superseded this one
      try {
        var json = JSON.parse(e.target.result);
        if (!json.legs || !json.legs.length) {
          throw new Error('no "legs" array found — is this a BDSP instance JSON?');
        }
        var stem = file.name.replace(/\.[^.]*$/, '');
        currentInstance = core.parseInstance(json, stem);
        showStatus('instance-status',
          'Loaded custom instance "' + stem + '": ' + currentInstance.legs.length +
          ' legs, ' + currentInstance.numTours + ' tours — no BKS comparison',
          'status-ok');
      } catch (err) {
        currentInstance = null;
        showStatus('instance-status', 'Invalid instance JSON: ' + err.message, 'status-error');
      }
    };
    reader.onerror = function () {
      if (token !== loadToken) return;
      currentInstance = null;
      showStatus('instance-status', 'Failed to read file.', 'status-error');
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // renderResults
  // ---------------------------------------------------------------------------

  function renderResults(instance, employees, legCheck, csvText) {
    var resultsSection = document.getElementById('results-section');
    var container = document.getElementById('results-content');

    var result = core.evaluateSolution(instance, employees);
    var evaluated = result.evaluated;
    var totalObjective = result.totalCost;
    var allFeasible = result.allFeasible;

    var covered = legCheck.unassigned.length === 0 && legCheck.duplicates.length === 0;
    var isNewBest = !!(currentBKS && currentBKS.bks != null && allFeasible && covered &&
      totalObjective < currentBKS.bks);

    var html = '';

    // Summary bar
    html += '<div class="breakdown-summary">';
    html += '<span><strong>Employees:</strong> ' + evaluated.length + '</span>';
    html += '<span><strong>Total cost:</strong> ' + formatNum(totalObjective) + '</span>';
    var feasClass = allFeasible ? 'badge-optimal' : 'badge-open';
    var feasText = allFeasible ? 'Feasible' : 'Infeasible';
    html += '<span class="status-badge ' + feasClass + '">' + feasText + '</span>';

    // BKS comparison
    if (currentBKS && currentBKS.bks != null && allFeasible) {
      var bksVal = currentBKS.bks;
      var gap = (totalObjective - bksVal) / bksVal * 100;
      if (totalObjective < bksVal) {
        html += '<span class="bks-ref bks-new-best">★ New best! Gap to BKS (' +
          formatNum(bksVal) + '): ' + gap.toFixed(2) + '%</span>';
      } else {
        html += '<span class="bks-ref">Gap to BKS (' + formatNum(bksVal) + '): ' +
          (gap >= 0 ? '+' : '') + gap.toFixed(2) + '%</span>';
      }
    } else if (currentBKS && currentBKS.bks != null) {
      html += '<span class="bks-ref">BKS: ' + formatNum(currentBKS.bks) + '</span>';
    }

    // Leg coverage
    if (legCheck.unassigned.length === 0 && legCheck.duplicates.length === 0) {
      html += '<span class="leg-coverage leg-coverage-ok">✓ All ' + instance.legs.length + ' legs covered</span>';
    } else {
      if (legCheck.unassigned.length > 0) {
        html += '<span class="leg-coverage leg-coverage-warn">⚠ ' + legCheck.unassigned.length + ' leg(s) unassigned</span>';
      }
      if (legCheck.duplicates.length > 0) {
        html += '<span class="leg-coverage leg-coverage-warn">⚠ ' + legCheck.duplicates.length + ' leg(s) assigned multiple times</span>';
      }
    }
    html += '</div>';

    // Objective formula
    html += '<div class="obj-formula">';
    html += '\\[ O_e = 2W\' + T + \\text{ride} + 30\\cdot\\text{changes} + 180\\cdot\\text{splits}, \\quad W\' = \\max(\\text{work\\_time},\\; 390) \\]';
    html += '<span class="formula-note">Infeasible employees additionally incur \\(1000\\times\\) hard-constraint penalties.</span>';
    html += '</div>';

    // Per-employee breakdown table
    html += '<div style="overflow-x:auto;">';
    html += '<table class="algo-table breakdown-table">';
    html += '<thead><tr>';
    html += '<th>Employee</th><th>Cost</th><th>Obj</th><th>W′</th><th>T</th><th>Ride</th>';
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
      var fIcon = s.feasible ? '✓' : '✗';
      html += '<td class="' + (s.feasible ? 'feasible-icon' : 'infeasible-icon') + '">' + fIcon + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Hard-constraint diagnostics for infeasible employees
    if (!allFeasible) {
      html += '<div class="violation-detail">';
      html += '<p><strong>Why is this solution infeasible?</strong></p>';
      evaluated.forEach(function (ev) {
        if (ev.state.feasible) return;
        var messages = core.violationList(ev.state).map(function (v) { return v.message; });
        html += '<p><strong class="violation-emp">' + escapeHtml(ev.emp.name) + ':</strong> ' +
          escapeHtml(messages.join('; ')) + '.</p>';
      });
      html += '</div>';
    }

    // Actions
    html += '<p class="results-actions">';
    html += '<button type="button" id="download-breakdown-btn">Download breakdown CSV</button>';
    html += '</p>';

    // Schedule timeline
    if (window.BDSP_GANTT) {
      html += '<details class="gantt-details"><summary>Schedule timeline</summary>';
      html += '<div class="gantt-legend">solid = driving &nbsp;&middot;&nbsp; gray = passive ride &nbsp;&middot;&nbsp; tick = sign-on/off &nbsp;&middot;&nbsp; dashed = split break (&ge; 3 h)</div>';
      html += window.BDSP_GANTT.render(instance, evaluated);
      html += '</details>';
    }

    // Submission panel — only for a strictly better, fully covered, feasible
    // solution of a collection instance (the same criteria the CI applies).
    if (isNewBest) {
      var subName = instance.name + '.csv';
      var prefillUrl = 'https://github.com/TomManMaz/tommanmaz.github.io/new/main?filename=' +
        encodeURIComponent('submissions/' + instance.name + '.csv') +
        '&value=' + encodeURIComponent(csvText || '');
      var ghUrl, ghHow;
      if (csvText && prefillUrl.length <= 7000) {
        ghUrl = prefillUrl;
        ghHow = 'the file name and content are pre-filled; GitHub forks the repository for you';
      } else {
        // /upload/ requires push access (404 for everyone else); /new/ supports
        // GitHub's automatic fork-and-PR flow, so prefill only the filename.
        ghUrl = 'https://github.com/TomManMaz/tommanmaz.github.io/new/main?filename=' +
          encodeURIComponent('submissions/' + instance.name + '.csv');
        ghHow = 'the file name is pre-filled; paste the contents of the file from step 1 ' +
          'and GitHub forks the repository for you';
      }
      html += '<div class="submit-panel">';
      html += '<p><strong>Submit as the new best known solution</strong></p>';
      html += '<p>Submissions are validated automatically: a feasible solution that strictly ' +
        'improves the BKS is published within minutes and credited to your GitHub account.</p>';
      html += '<ol>';
      html += '<li>Download the solution named after the instance: ' +
        '<button type="button" id="download-submission-btn">' + escapeHtml(subName) + '</button></li>';
      html += '<li><a href="' + ghUrl + '" target="_blank" rel="noopener">Add the file on GitHub</a> ' +
        'under <code>submissions/</code> (' + ghHow + ').</li>';
      html += '<li>Open the pull request — the validator bot comments the verdict and publishes ' +
        'an accepted result automatically.</li>';
      html += '</ol>';
      html += '<p>Details: <a href="https://github.com/TomManMaz/tommanmaz.github.io/tree/main/submissions" ' +
        'target="_blank" rel="noopener">submission guide</a>.</p>';
      html += '</div>';
    }

    // Leg coverage details (if issues)
    if (legCheck.unassigned.length > 0 || legCheck.duplicates.length > 0) {
      html += '<div class="leg-coverage-detail">';
      if (legCheck.unassigned.length > 0) {
        html += '<p><strong>Unassigned legs:</strong> ';
        html += legCheck.unassigned.slice(0, 20).map(function (l) {
          return escapeHtml('leg ' + l.sortedIdx + ' (tour ' + l.tour + ', ' + l.start + '–' + l.end + ')');
        }).join(', ');
        if (legCheck.unassigned.length > 20) html += ', …';
        html += '</p>';
      }
      if (legCheck.duplicates.length > 0) {
        html += '<p><strong>Duplicated legs:</strong> ';
        html += legCheck.duplicates.slice(0, 20).map(function (d) {
          return escapeHtml('leg ' + d.leg.sortedIdx + ' (' + d.count + 'x)');
        }).join(', ');
        if (legCheck.duplicates.length > 20) html += ', …';
        html += '</p>';
      }
      html += '</div>';
    }

    container.innerHTML = html;

    var breakdownBtn = document.getElementById('download-breakdown-btn');
    if (breakdownBtn) {
      breakdownBtn.addEventListener('click', function () {
        downloadText(instance.name + '_breakdown.csv', core.breakdownToCsv(evaluated));
      });
    }
    var submissionBtn = document.getElementById('download-submission-btn');
    if (submissionBtn) {
      submissionBtn.addEventListener('click', function () {
        downloadText(instance.name + '.csv', csvText);
      });
    }

    resultsSection.style.display = 'block';
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([container]).then(function () {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function (err) { console.error(err); });
    } else {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------------------------------------------------------------------------
  // Validate button handler
  // ---------------------------------------------------------------------------

  function onValidate() {
    var fileInput = document.getElementById('solution-upload');
    var validateBtn = document.getElementById('validate-btn');

    // Clear previous validation status
    showStatus('validate-status', '', '');

    if (!currentInstance) {
      showStatus('validate-status', 'Please select and load an instance first.', 'status-error');
      return;
    }

    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      showStatus('solution-status', 'Please choose a solution CSV file.', 'status-error');
      return;
    }

    validateBtn.disabled = true;
    showStatus('validate-status', 'Validating…', 'status-loading');
    document.getElementById('results-section').style.display = 'none';

    // Yield to the browser so the loading text actually paints before
    // the (synchronous) evaluation kicks in.
    setTimeout(function () {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var employees = core.parseSolution(e.target.result, currentInstance);
          if (!employees.length) {
            showStatus('validate-status', 'No employees found in CSV (all rows were empty).', 'status-error');
            validateBtn.disabled = false;
            return;
          }
          var legCheck = core.validateLegs(currentInstance, employees);
          renderResults(currentInstance, employees, legCheck, e.target.result);
          showStatus('validate-status', 'Validation complete — ' + employees.length + ' employee(s).', 'status-ok');
        } catch (err) {
          showStatus('validate-status', 'Error: ' + err.message, 'status-error');
          document.getElementById('results-section').style.display = 'none';
        }
        validateBtn.disabled = false;
      };
      reader.onerror = function () {
        showStatus('validate-status', 'Failed to read file.', 'status-error');
        validateBtn.disabled = false;
      };
      reader.readAsText(file);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    populateSelector();

    var validateBtn = document.getElementById('validate-btn');
    if (validateBtn) validateBtn.addEventListener('click', onValidate);

    var instanceUpload = document.getElementById('instance-upload');
    if (instanceUpload) instanceUpload.addEventListener('change', onInstanceUpload);

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
