/**
 * QAPLIB Instance Detail
 * Renders one instance from window.QAP_DATA (?instance=<name>): summary,
 * where the best known value comes from, its permutation (fetched from the
 * stored .sln file), the optimality proof or best lower bound, the record
 * history, and downloads.
 */

(function () {
  'use strict';

  var data = null;

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNumber(val) {
    return val == null ? '—' : val.toLocaleString('en-US');
  }

  function summaryCard(label, value, optimal) {
    return '<div class="summary-card"><div class="label">' + label + '</div>' +
      '<div class="value' + (optimal ? ' optimal' : '') + '">' + value + '</div></div>';
  }

  function citation(key) {
    var ref = data.references[key];
    if (!ref) return '';
    return escapeHtml(ref.text) + (ref.url ? ' <a href="' + escapeHtml(ref.url) + '">Link</a>' : '');
  }

  function instanceLink(name) {
    return 'qap_instance.html?instance=' + encodeURIComponent(name);
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  function header(e) {
    return '<div class="instance-header"><h1>' + escapeHtml(e.name) + '</h1>' +
      '<span class="status-badge ' + (e.status === 'optimal' ? 'badge-optimal' : 'badge-open') + '">' +
      e.status + '</span></div>';
  }

  function summary(e) {
    var optimal = e.status === 'optimal';
    return '<div class="summary-grid">' +
      summaryCard('Family', escapeHtml(e.family)) +
      summaryCard('n', e.n) +
      summaryCard('BKS', formatNumber(e.bks), optimal) +
      summaryCard('Lower Bound', formatNumber(e.lower_bound)) +
      summaryCard('Gap (%)', e.gap_pct.toFixed(2), optimal) +
      '</div>';
  }

  function bestKnownSolution(e) {
    var html = '<h2>Best Known Solution</h2>';
    if (e.bks_source) {
      html += '<p>Value <strong>' + formatNumber(e.bks) + '</strong>, from ' + citation(e.bks_source) + '</p>';
    } else if (e.qaplib_2012) {
      html += '<p>Value <strong>' + formatNumber(e.bks) + '</strong>, as listed in the official QAPLIB table' +
        (e.qaplib_2012.found_by ? ' (method label: ' + escapeHtml(e.qaplib_2012.found_by) + ')' : '') + '.</p>';
    } else {
      html += '<p>Value <strong>' + formatNumber(e.bks) + '</strong>.</p>';
    }
    html += '<p class="field-hint">Permutation (<em>p</em>(<em>i</em>) = location of facility <em>i</em>), ' +
      'recomputed on the official data:</p>';
    html += '<pre id="permutation">Loading&hellip;</pre>';
    return html;
  }

  function proofOrBound(e) {
    if (e.status === 'optimal') {
      return '<h2>Optimality</h2><p>' + (e.proof === 'qaplib'
        ? 'Listed as optimal in the official QAPLIB table.'
        : 'Proved optimal: ' + citation(e.proof)) + '</p>';
    }
    var html = '<h2>Lower Bound</h2><p><strong>' + formatNumber(e.lower_bound) + '</strong>, from ' +
      citation(e.lower_bound_source) + '</p>';
    if (e.qaplib_2012 && e.qaplib_2012.lower_bound != null) {
      html += '<p class="field-hint">The official 2012 table gives ' + formatNumber(e.qaplib_2012.lower_bound) + '.</p>';
    }
    return html;
  }

  function history(e) {
    if (!e.history) return '';
    var html = '<h2>Record History</h2><div class="table-scroll"><table><thead><tr><th>Value</th><th>Year</th>' +
      '<th>Source</th></tr></thead><tbody>';
    e.history.forEach(function (h) {
      html += '<tr><td class="num">' + formatNumber(h.value) + '</td><td>' + (h.year || '—') + '</td><td>' +
        (h.note ? escapeHtml(h.note) : citation(h.source)) + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function comparison(e) {
    var html = '<h2>Compared With the Official Tables</h2>';
    if (!e.qaplib_2012) {
      return html + '<p>This instance is in the official data archive but not in the QAPLIB table.</p>';
    }
    html += '<p>The official 2012 table lists ' + formatNumber(e.qaplib_2012.value) + ' (' + e.qaplib_2012.status + '). ';
    html += e.changes.length ? 'Changed since: ' + escapeHtml(e.changes.join(', ')) + '.' : 'Unchanged since.';
    html += '</p>';
    (e.notes || []).forEach(function (key) { html += '<p class="community-note">Note: ' + citation(key) + '</p>'; });
    return html;
  }

  function family(e) {
    var fam = data.families[e.family];
    if (!fam) return '';
    return '<h2>Family</h2><p><code>' + escapeHtml(e.family) + '</code>: introduced by ' + escapeHtml(fam.authors) +
      '. ' + escapeHtml(fam.description) + '</p>';
  }

  function downloads(e) {
    return '<h2>Downloads</h2>' +
      '<div class="download-section"><div class="download-section-label">Files</div><div class="download-links">' +
      '<a class="download-btn" href="' + escapeHtml(e.instance_url) + '" download>Instance (.dat)</a>' +
      '<a class="download-btn" href="' + escapeHtml(e.solution_url) + '" download>Best Solution (.sln)</a>' +
      '</div></div>' +
      '<div class="download-section"><div class="download-section-label">Tools</div><div class="download-links">' +
      '<a class="download-btn" href="qap_validate.html?instance=' + encodeURIComponent(e.name) + '">Check a permutation</a>' +
      '</div></div>';
  }

  function navigation(e) {
    var list = data.instances;
    var idx = list.indexOf(e);
    var prev = idx > 0 ? '<a href="' + instanceLink(list[idx - 1].name) + '">&larr; ' + escapeHtml(list[idx - 1].name) + '</a>' : '<span></span>';
    var next = idx < list.length - 1 ? '<a href="' + instanceLink(list[idx + 1].name) + '">' + escapeHtml(list[idx + 1].name) + ' &rarr;</a>' : '<span></span>';
    return '<div class="instance-nav">' + prev + next + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function showPermutation(e) {
    var target = document.getElementById('permutation');
    fetch(e.solution_url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        target.textContent = text.split('\n').slice(1).join('\n').trim();
      })
      .catch(function () {
        target.innerHTML = 'Could not load it here; <a href="' + escapeHtml(e.solution_url) + '">download the .sln file</a>.';
      });
  }

  function render() {
    var container = document.getElementById('instance-content');
    var name = new URLSearchParams(window.location.search).get('instance');
    var e = data && data.instances.filter(function (x) { return x.name === name; })[0];
    if (!e) {
      container.innerHTML = '<p>' + (name ? 'Instance "' + escapeHtml(name) + '" not found.' : 'No instance specified.') +
        ' <a href="qap_collection.html">Return to the instances</a>.</p>';
      return;
    }
    document.getElementById('page-title').textContent = e.name + ' — QAPLIB Instance — Tommaso Mannelli Mazzoli';
    container.innerHTML = header(e) + summary(e) + bestKnownSolution(e) + proofOrBound(e) + history(e) +
      comparison(e) + family(e) + downloads(e) + navigation(e);
    showPermutation(e);
  }

  document.addEventListener('DOMContentLoaded', function () {
    data = window.QAP_DATA;
    render();
  });
})();
