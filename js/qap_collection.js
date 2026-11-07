/**
 * QAPLIB Collection Table
 * One sortable, searchable table of all instances from window.QAP_DATA,
 * filtered by status (all / optimal / open / updated since 2012) and family,
 * plus the families table.
 *
 * The controls are rendered once; state changes only re-render the table,
 * so typing in the search box keeps focus and caret position.
 */

(function () {
  'use strict';

  var data = null;
  var rendered = false;
  var state = { sortColumn: 'id', sortAscending: true, search: '', status: 'all', family: 'all', filtered: [] };

  var COLUMNS = [
    { key: 'id', label: 'Instance' },
    { key: 'family', label: 'Family' },
    { key: 'n', label: 'n' },
    { key: 'status', label: 'Status' },
    { key: 'bks', label: 'BKS' },
    { key: 'lower_bound', label: 'Lower Bound' },
    { key: 'gap', label: 'Gap (%)' },
    { key: 'bks_by', label: 'BKS From' },
    { key: 'bound_by', label: 'Proof / Bound From' }
  ];

  var STATUS_FILTERS = [['all', 'All'], ['optimal', 'Optimal'], ['open', 'Open'], ['updated', 'Updated since 2012']];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNumber(val) {
    return val == null ? '—' : val.toLocaleString('en-US');
  }

  function shortReference(key) {
    var ref = key && data.references[key];
    return ref ? ref.short : '';
  }

  // Who found the BKS: a cited paper, the QAPLIB method label, or just QAPLIB.
  function bksFrom(e) {
    if (e.bks_source) return shortReference(e.bks_source);
    if (!e.qaplib_2012) return shortReference(e.proof);
    return e.qaplib_2012.found_by ? 'QAPLIB (' + e.qaplib_2012.found_by + ')' : 'QAPLIB';
  }

  function boundFrom(e) {
    return shortReference(e.status === 'optimal' ? e.proof : e.lower_bound_source);
  }

  // Nulls always sort last, whatever the direction.
  function compareValues(a, b, asc) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    var cmp = typeof a === 'string' ? a.localeCompare(b, 'en', { numeric: true }) : a - b;
    return asc ? cmp : -cmp;
  }

  function sortValue(e, col) {
    switch (col) {
      case 'family': return e.family;
      case 'n': return e.n;
      case 'status': return e.status;
      case 'bks': return e.bks;
      case 'lower_bound': return e.lower_bound;
      case 'gap': return e.gap_pct;
      case 'bks_by': return bksFrom(e);
      case 'bound_by': return boundFrom(e);
      default: return null;  // 'id': the data's natural order (family, n, name)
    }
  }

  function sorted(instances) {
    if (state.sortColumn === 'id') {
      return state.sortAscending ? instances.slice() : instances.slice().reverse();
    }
    return instances.slice().sort(function (a, b) {
      return compareValues(sortValue(a, state.sortColumn), sortValue(b, state.sortColumn), state.sortAscending) ||
        data.instances.indexOf(a) - data.instances.indexOf(b);
    });
  }

  function matches(e) {
    if (state.status === 'updated' && e.changes.length === 0) return false;
    if ((state.status === 'optimal' || state.status === 'open') && e.status !== state.status) return false;
    if (state.family !== 'all' && e.family !== state.family) return false;
    return !state.search || e.name.toLowerCase().indexOf(state.search.toLowerCase()) !== -1;
  }

  // ---------------------------------------------------------------------------
  // Render: controls (once) and table (on every state change)
  // ---------------------------------------------------------------------------

  function controls() {
    var counts = { all: data.instances.length, optimal: 0, open: 0, updated: 0 };
    var families = {};
    data.instances.forEach(function (e) {
      counts[e.status]++;
      if (e.changes.length) counts.updated++;
      families[e.family] = (families[e.family] || 0) + 1;
    });

    var html = '<div class="collection-controls">';
    html += '<div class="collection-search"><input type="search" class="table-search" placeholder="Search..." ' +
      'aria-label="Search instances by name"></div>';
    html += '<div class="collection-filters" role="group" aria-label="Filter by status">';
    STATUS_FILTERS.forEach(function (f) {
      var on = state.status === f[0];
      html += '<button type="button" class="filter-btn' + (on ? ' active' : '') + '" data-status="' + f[0] +
        '" aria-pressed="' + on + '">' + f[1] + ' (' + counts[f[0]] + ')</button>';
    });
    html += '</div>';
    html += '<div class="collection-source-filter"><select class="family-filter" aria-label="Filter by family">';
    html += '<option value="all">All families (' + data.instances.length + ')</option>';
    Object.keys(families).sort().forEach(function (f) {
      html += '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + ' (' + families[f] + ')</option>';
    });
    html += '</select></div></div>';
    return html;
  }

  function row(e) {
    var html = '<tr' + (e.status === 'optimal' ? ' class="optimal-solution"' : '') + '>';
    html += '<td><a href="qap_instance.html?instance=' + encodeURIComponent(e.name) + '">' + escapeHtml(e.name) + '</a>' +
      (e.changes.length ? ' <span class="community-tag" title="' + escapeHtml(e.changes.join(', ')) + '">updated</span>' : '') +
      '</td>';
    html += '<td>' + escapeHtml(e.family) + '</td>';
    html += '<td class="num">' + e.n + '</td>';
    html += '<td><span class="status-badge ' + (e.status === 'optimal' ? 'badge-optimal' : 'badge-open') + '">' +
      e.status + '</span></td>';
    html += '<td class="num">' + formatNumber(e.bks) + '</td>';
    html += '<td class="num">' + formatNumber(e.lower_bound) + '</td>';
    html += e.gap_pct === 0
      ? '<td class="num"><span class="gap-optimal">0.00</span></td>'
      : '<td class="num">' + e.gap_pct.toFixed(2) + '</td>';
    html += '<td>' + escapeHtml(bksFrom(e)) + '</td>';
    html += '<td>' + escapeHtml(boundFrom(e)) + '</td>';
    return html + '</tr>';
  }

  function renderTable() {
    var view = sorted(data.instances.filter(matches));
    state.filtered = view;

    var html = '<table class="collection-table"><thead><tr>';
    COLUMNS.forEach(function (col) {
      var active = state.sortColumn === col.key;
      var dir = active ? (state.sortAscending ? 'ascending' : 'descending') : 'none';
      var cls = active ? (state.sortAscending ? ' sort-asc' : ' sort-desc') : '';
      html += '<th class="sortable' + cls + '" aria-sort="' + dir + '"><button type="button" class="sort-btn" ' +
        'data-sort="' + col.key + '">' + col.label + '</button></th>';
    });
    html += '</tr></thead><tbody>';
    if (view.length === 0) {
      html += '<tr><td colspan="' + COLUMNS.length + '" class="no-match">No instances match.</td></tr>';
    }
    view.forEach(function (e) { html += row(e); });
    html += '</tbody></table>';
    document.getElementById('qap-table').innerHTML = html;
    document.getElementById('qap-count').textContent =
      'Showing ' + view.length + ' of ' + data.instances.length + ' instances.';
  }

  function renderFamilies() {
    var counts = {};
    data.instances.forEach(function (e) { counts[e.family] = (counts[e.family] || 0) + 1; });
    var html = '<table><thead><tr><th>Family</th><th>Instances</th><th>Introduced by</th><th>Description</th></tr></thead><tbody>';
    Object.keys(data.families).forEach(function (f) {
      var fam = data.families[f];
      html += '<tr><td><code>' + escapeHtml(f) + '</code></td><td>' + (counts[f] || 0) + '</td><td>' +
        escapeHtml(fam.authors) + '</td><td>' + escapeHtml(fam.description) + '</td></tr>';
    });
    document.getElementById('qap-families').innerHTML = html + '</tbody></table>';
  }

  function render() {
    var container = document.getElementById('qap-table-container');
    container.innerHTML = controls() +
      '<div class="collection-table-wrapper" id="qap-table"></div>' +
      '<p class="collection-summary" id="qap-count"></p>';
    bindEvents(container);
    renderTable();
    renderFamilies();
    document.getElementById('qap-updated').textContent =
      new Date(data.updated + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    rendered = true;
  }

  // ---------------------------------------------------------------------------
  // Events (delegated, bound once)
  // ---------------------------------------------------------------------------

  function bindEvents(container) {
    container.addEventListener('click', function (e) {
      var sortBtn = e.target.closest('.sort-btn');
      if (sortBtn) {
        var col = sortBtn.getAttribute('data-sort');
        state.sortAscending = state.sortColumn === col ? !state.sortAscending : true;
        state.sortColumn = col;
        renderTable();
        var again = container.querySelector('.sort-btn[data-sort="' + col + '"]');
        if (again) again.focus();  // keep keyboard focus on the activated header
        return;
      }
      var filterBtn = e.target.closest('.filter-btn');
      if (filterBtn) {
        state.status = filterBtn.getAttribute('data-status');
        container.querySelectorAll('.filter-btn').forEach(function (b) {
          var on = b === filterBtn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        renderTable();
      }
    });
    container.addEventListener('input', function (e) {
      if (!e.target.classList.contains('table-search')) return;
      state.search = e.target.value;
      renderTable();
    });
    container.addEventListener('change', function (e) {
      if (!e.target.classList.contains('family-filter')) return;
      state.family = e.target.value;
      renderTable();
    });
  }

  // ---------------------------------------------------------------------------
  // CSV export (exactly the current view)
  // ---------------------------------------------------------------------------

  window.exportQapCSV = function () {
    if (!data) return;
    var rows = [['Instance', 'Family', 'n', 'Status', 'BKS', 'Lower Bound', 'Gap (%)', 'BKS From', 'Proof / Bound From', 'Changes Since 2012']];
    (rendered ? state.filtered : data.instances).forEach(function (e) {
      rows.push([e.name, e.family, e.n, e.status, e.bks, e.lower_bound, e.gap_pct, bksFrom(e), boundFrom(e), e.changes.join('; ')]);
    });
    function csvCell(value) {
      var s = value == null ? '' : String(value);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'qaplib_bks.csv';
    document.body.appendChild(link);  // Firefox needs it in the document
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  };

  document.addEventListener('DOMContentLoaded', function () {
    data = window.QAP_DATA;
    if (data) render();
  });
})();
