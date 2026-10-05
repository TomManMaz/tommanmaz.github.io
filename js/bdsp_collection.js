/**
 * BDSP Collection Tables
 * Renders two separate tables: Realistic instances (JAIR) and
 * Synthetic instances (PATAT 2024). Each is sortable and searchable.
 *
 * The controls (search, filters) are rendered once; state changes only
 * re-render the affected table, so typing in a search box keeps focus and
 * caret position.
 */

(function () {
  'use strict';

  var allInstances = [];
  var rendered = false;

  // Per-table state keyed by table id. `filtered` holds the
  // most recent filtered+sorted view, used by CSV export.
  var tableState = {
    realistic: { sortColumn: 'id', sortAscending: true, search: '', status: 'all', filtered: [] },
    patat:     { sortColumn: 'id', sortAscending: true, search: '', source: 'all', filtered: [] }
  };

  var COLUMNS = {
    realistic: [
      { key: 'id', label: 'Instance' },
      { key: 'status', label: 'Status' },
      { key: 'size', label: 'Size' },
      { key: 'tours', label: 'Tours' },
      { key: 'legs', label: 'Legs' },
      { key: 'bks', label: 'BKS' },
      { key: 'lower_bound', label: 'Lower Bound' },
      { key: 'gap', label: 'Gap (%)' },
      { key: 'best_algorithm', label: 'Best Algorithm' }
    ],
    // no Lower Bound / Gap columns, add Source column
    patat: [
      { key: 'id', label: 'Instance' },
      { key: 'source', label: 'Source' },
      { key: 'size', label: 'Size' },
      { key: 'tours', label: 'Tours' },
      { key: 'legs', label: 'Legs' },
      { key: 'bks', label: 'BKS' },
      { key: 'best_algorithm', label: 'Best Algorithm' }
    ]
  };

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  function loadData() {
    var container = document.getElementById('collection-table-container');
    if (!container) return;

    if (window.BDSP_INSTANCES) {
      allInstances = window.BDSP_INSTANCES;
      render();
      return;
    }

    container.innerHTML = '<p>Loading instance data...</p>';

    fetch('data/instances.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        allInstances = data;
        render();
      })
      .catch(function (err) {
        container.innerHTML = '<p>Error loading instance data: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Nulls always sort last, whatever the direction.
  function compareValues(a, b, asc) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    var cmp = typeof a === 'string'
      ? a.localeCompare(b, 'en', { numeric: true })  // breakMax_50_1 < breakMax_100_1
      : a - b;
    return asc ? cmp : -cmp;
  }

  function getSortValue(inst, col) {
    switch (col) {
      case 'source': return inst.source || '';
      case 'status': return inst.status;
      case 'size': return inst.size;
      case 'tours': return inst.tours;
      case 'legs': return inst.legs;
      case 'bks': return inst.bks;
      case 'gap': return inst.gap_pct;
      case 'best_algorithm': return inst.best_algorithm;
      case 'lower_bound': return inst.lower_bound;
      default: return inst.name;  // 'id': natural name order (source, size, number)
    }
  }

  function sortInstances(instances, state) {
    var col = state.sortColumn;
    return instances.slice().sort(function (a, b) {
      return compareValues(getSortValue(a, col), getSortValue(b, col), state.sortAscending) ||
        compareValues(a.name, b.name, true);
    });
  }

  function formatNumber(val) {
    if (val == null) return '—';
    return val.toLocaleString('en-US');
  }

  function formatGap(val) {
    if (val == null) return '—';
    return val.toFixed(1);
  }

  function formatBound(val) {
    if (val == null) return '—';
    if (Number.isInteger(val)) return val.toLocaleString('en-US');
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function algorithmCell(inst) {
    return '<td>' + escapeHtml(inst.best_algorithm || '—') +
      (inst.bks_source === 'community' ? ' <span class="community-tag">community</span>' : '') + '</td>';
  }

  // ---------------------------------------------------------------------------
  // Render: page skeleton + controls (once)
  // ---------------------------------------------------------------------------

  function render() {
    var container = document.getElementById('collection-table-container');
    if (!container) return;

    var realistic = allInstances.filter(function (i) { return i.source === 'realistic'; });
    var patat = allInstances.filter(function (i) { return i.source !== 'realistic'; });

    var html = '';
    html += '<h3>Realistic Instances (' + realistic.length + ')</h3>';
    html += realisticControls(realistic);
    html += '<div class="collection-table-wrapper" id="table-realistic"></div>';

    html += '<h3 class="collection-section">Synthetic Instances — PATAT 2024 (' + patat.length + ')</h3>';
    html += patatControls(patat);
    html += '<div class="collection-table-wrapper" id="table-patat"></div>';

    html += '<p class="collection-summary">';
    html += 'Total: ' + allInstances.length + ' instances (' + realistic.length + ' realistic, ' + patat.length + ' synthetic).';
    html += '</p>';

    container.innerHTML = html;
    bindEvents(container);
    renderTable('realistic');
    renderTable('patat');
    rendered = true;
  }

  function searchBox(table) {
    return '  <div class="collection-search">' +
      '<input type="search" class="table-search" data-table="' + table + '" placeholder="Search..." ' +
      'aria-label="Search ' + table + ' instances by name"></div>';
  }

  function realisticControls(instances) {
    var state = tableState.realistic;
    var counts = { all: instances.length, optimal: 0, open: 0 };
    instances.forEach(function (i) { if (counts[i.status] != null) counts[i.status]++; });

    var html = '<div class="collection-controls">' + searchBox('realistic');
    html += '  <div class="collection-filters" role="group" aria-label="Filter by status">';
    [['all', 'All'], ['optimal', 'Optimal'], ['open', 'Open']].forEach(function (f) {
      var on = state.status === f[0];
      html += '<button type="button" class="filter-btn' + (on ? ' active' : '') + '" data-table="realistic" ' +
        'data-status="' + f[0] + '" aria-pressed="' + on + '">' + f[1] + ' (' + counts[f[0]] + ')</button>';
    });
    html += '  </div></div>';
    return html;
  }

  function patatControls(instances) {
    var state = tableState.patat;
    var counts = {};
    instances.forEach(function (i) {
      var s = i.source || 'unknown';
      counts[s] = (counts[s] || 0) + 1;
    });

    var html = '<div class="collection-controls">' + searchBox('patat');
    html += '  <div class="collection-source-filter">';
    html += '    <select class="source-filter" data-table="patat" aria-label="Filter by instance type">';
    html += '      <option value="all"' + (state.source === 'all' ? ' selected' : '') + '>All types (' + instances.length + ')</option>';
    Object.keys(counts).sort().forEach(function (s) {
      html += '      <option value="' + escapeHtml(s) + '"' + (state.source === s ? ' selected' : '') + '>' +
        escapeHtml(s) + ' (' + counts[s] + ')</option>';
    });
    html += '    </select>';
    html += '  </div></div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // Render: one table (on every state change)
  // ---------------------------------------------------------------------------

  function matches(table, inst) {
    var state = tableState[table];
    if (table === 'realistic') {
      if (inst.source !== 'realistic') return false;
      if (state.status !== 'all' && inst.status !== state.status) return false;
    } else {
      if (inst.source === 'realistic') return false;
      if (state.source !== 'all' && (inst.source || 'unknown') !== state.source) return false;
    }
    return !state.search || inst.name.toLowerCase().indexOf(state.search.toLowerCase()) !== -1;
  }

  function renderTable(table) {
    var state = tableState[table];
    var columns = COLUMNS[table];
    var sorted = sortInstances(allInstances.filter(function (i) { return matches(table, i); }), state);
    state.filtered = sorted;

    var html = '<table class="collection-table"><thead><tr>';
    columns.forEach(function (col) {
      var active = state.sortColumn === col.key;
      var dir = active ? (state.sortAscending ? 'ascending' : 'descending') : 'none';
      var sortCls = active ? (state.sortAscending ? ' sort-asc' : ' sort-desc') : '';
      html += '<th class="sortable' + sortCls + '" aria-sort="' + dir + '">' +
        '<button type="button" class="sort-btn" data-table="' + table + '" data-sort="' + col.key + '">' +
        col.label + '</button></th>';
    });
    html += '</tr></thead><tbody>';

    if (sorted.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" class="no-match">No instances match.</td></tr>';
    }

    sorted.forEach(function (inst) {
      var link = '<td><a href="bdsp_instance.html?instance=' + encodeURIComponent(inst.name) + '">' +
        escapeHtml(inst.name) + '</a></td>';
      if (table === 'realistic') {
        html += '<tr' + (inst.status === 'optimal' ? ' class="optimal-solution"' : '') + '>' + link;
        var badgeClass = inst.status === 'optimal' ? 'badge-optimal' : 'badge-open';
        html += '<td><span class="status-badge ' + badgeClass + '">' + escapeHtml(inst.status) + '</span></td>';
      } else {
        html += '<tr>' + link;
        html += '<td>' + escapeHtml(inst.source || '—') + '</td>';
      }
      html += '<td class="num">' + inst.size + '</td>';
      html += '<td class="num">' + inst.tours + '</td>';
      html += '<td class="num">' + inst.legs + '</td>';
      html += '<td class="num">' + formatNumber(inst.bks) + '</td>';
      if (table === 'realistic') {
        html += '<td class="num">' + formatBound(inst.lower_bound) +
          (inst.lower_bound_method === 'LB_flow'
            ? '<abbr class="lb-mark" title="Path-cover bound (LB_flow)">†</abbr>' : '') + '</td>';
        html += inst.gap_pct === 0
          ? '<td class="num"><span class="gap-optimal">' + formatGap(0) + '</span></td>'
          : '<td class="num">' + formatGap(inst.gap_pct) + '</td>';
      }
      html += algorithmCell(inst) + '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('table-' + table).innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Events (delegated, bound once)
  // ---------------------------------------------------------------------------

  function bindEvents(container) {
    container.addEventListener('click', function (e) {
      var sortBtn = e.target.closest('.sort-btn');
      if (sortBtn) {
        var table = sortBtn.getAttribute('data-table');
        var col = sortBtn.getAttribute('data-sort');
        var state = tableState[table];
        if (state.sortColumn === col) {
          state.sortAscending = !state.sortAscending;
        } else {
          state.sortColumn = col;
          state.sortAscending = true;
        }
        renderTable(table);
        // keep keyboard focus on the header that was activated
        var again = container.querySelector('.sort-btn[data-table="' + table + '"][data-sort="' + col + '"]');
        if (again) again.focus();
        return;
      }

      var filterBtn = e.target.closest('.filter-btn');
      if (filterBtn) {
        var tbl = filterBtn.getAttribute('data-table');
        tableState[tbl].status = filterBtn.getAttribute('data-status');
        container.querySelectorAll('.filter-btn[data-table="' + tbl + '"]').forEach(function (b) {
          var on = b === filterBtn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        renderTable(tbl);
      }
    });

    container.addEventListener('input', function (e) {
      if (!e.target.classList.contains('table-search')) return;
      var table = e.target.getAttribute('data-table');
      tableState[table].search = e.target.value;
      renderTable(table);
    });

    container.addEventListener('change', function (e) {
      if (!e.target.classList.contains('source-filter')) return;
      var table = e.target.getAttribute('data-table');
      tableState[table].source = e.target.value;
      renderTable(table);
    });
  }

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------

  window.exportCollectionCSV = function () {
    var rows = [['Instance', 'Source', 'Status', 'Size', 'Tours', 'Legs', 'BKS', 'Lower Bound', 'LB Method', 'Gap (%)', 'Best Algorithm']];
    // Exactly the current view (possibly empty); everything only before the first render.
    var visible = rendered
      ? tableState.realistic.filtered.concat(tableState.patat.filtered)
      : allInstances;
    visible.forEach(function (inst) {
      rows.push([
        inst.name,
        inst.source || '',
        inst.status,
        inst.size,
        inst.tours,
        inst.legs,
        inst.bks != null ? inst.bks : '',
        inst.lower_bound != null ? inst.lower_bound : '',
        inst.lower_bound_method || '',
        inst.gap_pct != null ? inst.gap_pct : '',
        inst.best_algorithm || ''
      ]);
    });

    // Community best_algorithm values are free text and may contain commas.
    function csvCell(value) {
      var s = value == null ? '' : String(value);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'bdsp_instances.csv';
    document.body.appendChild(link);  // Firefox needs it in the document
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  };

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', loadData);

})();
