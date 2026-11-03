/**
 * QAP permutation checker (qap_validate.html)
 * Loads the chosen instance (.dat from the collection, or an uploaded one),
 * parses a pasted or uploaded permutation with window.QAP_CORE, and reports
 * its cost against the best known value. A strictly better permutation gets
 * a panel with the .sln file to download and the pre-filled submission issue.
 */

(function () {
  'use strict';

  var core = window.QAP_CORE;
  var data = window.QAP_DATA;
  var ISSUE_URL = 'https://github.com/TomManMaz/tommanmaz.github.io/issues/new';

  var loaded = { entry: null, instance: null, label: '' };  // entry is null for an uploaded instance

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNumber(val) {
    return val.toLocaleString('en-US');
  }

  function setStatus(id, text, kind) {
    var el = $(id);
    el.textContent = text;
    el.className = 'validator-status' + (kind ? ' status-' + kind : '');
  }

  function findEntry(name) {
    return data.instances.filter(function (e) { return e.name === name; })[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Instance loading
  // ---------------------------------------------------------------------------

  function fillInstanceSelect() {
    var select = $('instance-select');
    data.instances.forEach(function (e) {
      var option = document.createElement('option');
      option.value = e.name;
      option.textContent = e.name + ' (n = ' + e.n + ')';
      select.appendChild(option);
    });
  }

  function loadCollectionInstance(name) {
    var entry = findEntry(name);
    loaded = { entry: null, instance: null, label: '' };
    if (!entry) {
      setStatus('instance-status', '', '');
      return Promise.resolve();
    }
    setStatus('instance-status', 'Loading ' + name + '…', 'loading');
    return fetch(entry.instance_url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        loaded = { entry: entry, instance: core.parseInstance(text), label: name };
        setStatus('instance-status', name + ' loaded: n = ' + entry.n + ', best known value ' + formatNumber(entry.bks) +
          ' (' + entry.status + ').', 'ok');
      })
      .catch(function (err) {
        setStatus('instance-status', 'Could not load ' + name + ': ' + err.message, 'error');
      });
  }

  function loadUploadedInstance(file) {
    readFile(file).then(function (text) {
      try {
        loaded = { entry: null, instance: core.parseInstance(text), label: file.name };
        $('instance-select').value = '';
        setStatus('instance-status', file.name + ' loaded: n = ' + loaded.instance.n + ' (no best known value to compare).', 'ok');
      } catch (err) {
        setStatus('instance-status', file.name + ': ' + err.message, 'error');
      }
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  // A solution file named after an instance (tai30a.sln) selects that instance.
  function onSolutionUpload(file) {
    readFile(file).then(function (text) {
      $('permutation-input').value = text.trim();
      var name = file.name.replace(/\.[^.]*$/, '').toLowerCase();
      if (findEntry(name) && (!loaded.entry || loaded.entry.name !== name)) {
        $('instance-select').value = name;
        loadCollectionInstance(name).then(check);
      } else if (loaded.instance) {
        check();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Check and report
  // ---------------------------------------------------------------------------

  function check() {
    var text = $('permutation-input').value;
    if (!loaded.instance) { setStatus('validate-status', 'Choose an instance first.', 'error'); return; }
    if (!text.trim()) { setStatus('validate-status', 'Paste a permutation or upload a file.', 'error'); return; }

    var parsed;
    try {
      parsed = core.parsePermutation(text, loaded.instance.n);
    } catch (err) {
      setStatus('validate-status', err.message, 'error');
      $('results-section').hidden = true;
      return;
    }
    setStatus('validate-status', '', '');
    var value = core.cost(loaded.instance, parsed.permutation);
    var inverseValue = core.cost(loaded.instance, core.inverse(parsed.permutation));
    showResult(parsed, value, inverseValue);
  }

  function verdict(value, entry) {
    if (!entry) {
      return '<p class="verdict verdict-ok">Valid permutation with cost ' + formatNumber(value) + '.</p>';
    }
    if (value < entry.bks) {
      return '<p class="verdict verdict-best">★ New best! Cost ' + formatNumber(value) + ', below the best known value ' +
        formatNumber(entry.bks) + ' of ' + escapeHtml(entry.name) + '.</p>';
    }
    if (value === entry.bks) {
      return '<p class="verdict verdict-ok">Valid permutation with cost ' + formatNumber(value) +
        ': it matches the best known value' + (entry.status === 'optimal' ? ', which is optimal' : '') + '.</p>';
    }
    var gap = 100 * (value - entry.bks) / entry.bks;
    return '<p class="verdict verdict-warn">Valid permutation with cost ' + formatNumber(value) + ' ' +
      '<span class="verdict-note">&mdash; ' + gap.toFixed(3) + '% above the best known value ' + formatNumber(entry.bks) + '.</span></p>';
  }

  function notes(parsed, value, inverseValue, entry) {
    var lines = [];
    if (parsed.zeroBased) lines.push('The list counts from 0; it was read as 1-based (each number plus one).');
    if (parsed.headerValue != null && parsed.headerValue !== value) {
      lines.push('The file header says ' + formatNumber(parsed.headerValue) + ', but the permutation costs ' + formatNumber(value) + '.');
    }
    if (inverseValue !== value) {
      var better = entry && inverseValue <= entry.bks && value > entry.bks;
      lines.push('The inverse permutation (the opposite convention) costs ' + formatNumber(inverseValue) + '.' +
        (better ? ' Your code probably uses the opposite convention: see "How the cost is computed".' : ''));
    }
    return lines.map(function (l) { return '<p class="field-hint">' + escapeHtml(l) + '</p>'; }).join('');
  }

  function submitPanel(entry, permutation, value) {
    var title = '[QAP] ' + entry.name + ' ' + value;
    var url = ISSUE_URL + '?template=new-qap-bks.yml&title=' + encodeURIComponent(title) +
      '&instance=' + encodeURIComponent(entry.name) + '&value=' + encodeURIComponent(value) +
      '&permutation=' + encodeURIComponent(permutation.join(' '));
    return '<div class="submit-panel"><p><strong>Submit it as the new best known solution:</strong></p><ol>' +
      '<li><button type="button" id="download-sln">Download ' + escapeHtml(entry.name) + '.sln</button> (optional, for your records).</li>' +
      '<li><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Open the pre-filled submission issue</a>, ' +
      'add the method and reference, and submit. You need a free GitHub account; or email it to ' +
      '<a href="mailto:tommanmaz.math@gmail.com">tommanmaz.math@gmail.com</a>.</li></ol></div>';
  }

  function showResult(parsed, value, inverseValue) {
    var entry = loaded.entry;
    var html = verdict(value, entry) + notes(parsed, value, inverseValue, entry);
    var isNewBest = entry && value < entry.bks;
    if (isNewBest) html += submitPanel(entry, parsed.permutation, value);
    $('results-content').innerHTML = html;
    $('results-section').hidden = false;
    if (isNewBest) {
      $('download-sln').addEventListener('click', function () {
        download(entry.name + '.sln', core.toSln(parsed.permutation, value));
      });
    }
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);  // Firefox needs it in the document
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    fillInstanceSelect();
    $('instance-select').addEventListener('change', function (e) { loadCollectionInstance(e.target.value); });
    $('instance-upload').addEventListener('change', function (e) {
      if (e.target.files[0]) loadUploadedInstance(e.target.files[0]);
    });
    $('solution-upload').addEventListener('change', function (e) {
      if (e.target.files[0]) onSolutionUpload(e.target.files[0]);
    });
    $('validate-btn').addEventListener('click', check);

    var preset = new URLSearchParams(window.location.search).get('instance');
    if (preset && findEntry(preset)) {
      $('instance-select').value = preset;
      loadCollectionInstance(preset);
    }
  });
})();
