/**
 * BDSP Collection Tables
 * Renders two separate tables: Realistic instances (JAIR) and
 * Synthetic instances (PATAT 2024). Each is sortable and searchable.
 */

(function () {
  'use strict';

  var allInstances = [];

  // Per-table state keyed by table id
  var tableState = {
    realistic: { sortColumn: 'id', sortAscending: true, search: '', status: 'all' },
    patat:     { sortColumn: 'id', sortAscending: true, search: '', source: 'all' }
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
        container.innerHTML = '<p>Error loading instance data: ' + err.message + '</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getInstanceId(name) {
    var parts = name.split('_');
    return parseInt(parts[parts.length - 1], 10) || 0;
  }

  function compareValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'string') return a.localeCompare(b);
    return a - b;
  }

  function getSortValue(inst, col) {
    switch (col) {
      case 'id': return getInstanceId(inst.name);
      case 'name': return inst.name;
      case 'source': return inst.source || '';
      case 'status': return inst.status;
      case 'size': return inst.size;
      case 'tours': return inst.tours;
      case 'legs': return inst.legs;
      case 'bks': return inst.bks;
      case 'gap': return inst.gap_pct;
      case 'best_algorithm': return inst.best_algorithm;
      case 'lower_bound': return inst.lower_bound;
      default: return getInstanceId(inst.name);
    }
  }

  function sortInstances(instances, state) {
    var col = state.sortColumn;
    var asc = state.sortAscending;
    return instances.slice().sort(function (a, b) {
      var va = getSortValue(a, col);
      var vb = getSortValue(b, col);
      var cmp = compareValues(va, vb);
      return asc ? cmp : -cmp;
    });
  }

  function formatNumber(val) {
    if (val == null) return '\u2014';
    return val.toLocaleString('en-US');
  }

  function formatGap(val) {
    if (val == null) return '\u2014';
    return val.toFixed(2);
  }

  function formatBound(val) {
    if (val == null) return '\u2014';
    if (Number.isInteger(val)) return val.toLocaleString('en-US');
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render() {
    var container = document.getElementById('collection-table-container');
    if (!container) return;

    var realistic = allInstances.filter(function (i) { return i.source === 'realistic'; });
    var patat = allInstances.filter(function (i) { return i.source !== 'realistic'; });

    var html = '';

    // --- Realistic table ---
    html += '<h3>Realistic Instances (' + realistic.length + ')</h3>';
    html += renderRealisticTable(realistic);

    // --- PATAT table ---
    html += '<h3 style="margin-top:2.5rem;">Synthetic Instances \u2014 PATAT 2024 (' + patat.length + ')</h3>';
    html += renderPatatTable(patat);

    // Summary
    html += '<p class="collection-summary">';
    html += 'Total: ' + allInstances.length + ' instances (' + realistic.length + ' realistic, ' + patat.length + ' synthetic).';
    html += '</p>';

    container.innerHTML = html;
    bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Realistic table
  // ---------------------------------------------------------------------------

  function renderRealisticTable(instances) {
    var state = tableState.realistic;

    // Filter
    var filtered = instances.filter(function (inst) {
      if (state.status !== 'all' && inst.status !== state.status) return false;
      if (state.search) {
        if (inst.name.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
      }
      return true;
    });

    var sorted = sortInstances(filtered, state);

    var html = '';

    // Controls
    html += '<div class="collection-controls">';
    html += '  <div class="collection-search">';
    html += '    <input type="text" class="table-search" data-table="realistic" placeholder="Search..." value="' + escapeHtml(state.search) + '">';
    html += '  </div>';
    html += '  <div class="collection-filters">';
    var optCount = instances.filter(function (i) { return i.status === 'optimal'; }).length;
    var openCount = instances.filter(function (i) { return i.status === 'open'; }).length;
    html += '    <button class="filter-btn' + (state.status === 'all' ? ' active' : '') + '" data-table="realistic" data-status="all">All (' + instances.length + ')</button>';
    html += '    <button class="filter-btn' + (state.status === 'optimal' ? ' active' : '') + '" data-table="realistic" data-status="optimal">Optimal (' + optCount + ')</button>';
    html += '    <button class="filter-btn' + (state.status === 'open' ? ' active' : '') + '" data-table="realistic" data-status="open">Open (' + openCount + ')</button>';
    html += '  </div>';
    html += '</div>';

    // Table
    var columns = [
      { key: 'id', label: 'Instance' },
      { key: 'status', label: 'Status' },
      { key: 'size', label: 'Size' },
      { key: 'tours', label: 'Tours' },
      { key: 'legs', label: 'Legs' },
      { key: 'bks', label: 'BKS' },
      { key: 'lower_bound', label: 'Lower Bound' },
      { key: 'gap', label: 'Gap (%)' },
      { key: 'best_algorithm', label: 'Best Algorithm' }
    ];

    html += '<div class="collection-table-wrapper">';
    html += '<table class="collection-table">';
    html += '<thead><tr>';
    columns.forEach(function (col) {
      var arrow = '';
      if (state.sortColumn === col.key) {
        arrow = state.sortAscending ? ' \u25B2' : ' \u25BC';
      }
      html += '<th class="sortable" data-table="realistic" data-sort="' + col.key + '">' + col.label + arrow + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (sorted.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" style="text-align:center;">No instances match.</td></tr>';
    }

    sorted.forEach(function (inst) {
      var rowClass = inst.status === 'optimal' ? ' class="optimal-solution"' : '';
      html += '<tr' + rowClass + '>';
      html += '<td><a href="bdsp_instance.html?instance=' + encodeURIComponent(inst.name) + '">' + escapeHtml(inst.name) + '</a></td>';

      var badgeClass = inst.status === 'optimal' ? 'badge-optimal' : 'badge-open';
      html += '<td><span class="status-badge ' + badgeClass + '">' + inst.status + '</span></td>';

      html += '<td class="num">' + inst.size + '</td>';
      html += '<td class="num">' + inst.tours + '</td>';
      html += '<td class="num">' + inst.legs + '</td>';
      html += '<td class="num">' + formatNumber(inst.bks) + '</td>';
      html += '<td class="num">' + formatBound(inst.lower_bound) + '</td>';

      if (inst.gap_pct != null && inst.gap_pct === 0) {
        html += '<td class="num"><span class="gap-optimal">0.00</span></td>';
      } else {
        html += '<td class="num">' + formatGap(inst.gap_pct) + '</td>';
      }

      html += '<td>' + escapeHtml(inst.best_algorithm || '\u2014') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // PATAT table
  // ---------------------------------------------------------------------------

  function renderPatatTable(instances) {
    var state = tableState.patat;

    // Filter
    var filtered = instances.filter(function (inst) {
      if (state.source !== 'all' && (inst.source || 'unknown') !== state.source) return false;
      if (state.search) {
        if (inst.name.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
      }
      return true;
    });

    var sorted = sortInstances(filtered, state);

    var html = '';

    // Controls
    html += '<div class="collection-controls">';
    html += '  <div class="collection-search">';
    html += '    <input type="text" class="table-search" data-table="patat" placeholder="Search..." value="' + escapeHtml(state.search) + '">';
    html += '  </div>';
    // Source filter dropdown
    var sources = [];
    instances.forEach(function (i) {
      var s = i.source || 'unknown';
      if (sources.indexOf(s) === -1) sources.push(s);
    });
    sources.sort();
    html += '  <div class="collection-source-filter">';
    html += '    <select class="source-filter" data-table="patat">';
    html += '      <option value="all"' + (state.source === 'all' ? ' selected' : '') + '>All types (' + instances.length + ')</option>';
    sources.forEach(function (s) {
      var cnt = instances.filter(function (i) { return (i.source || 'unknown') === s; }).length;
      html += '      <option value="' + escapeHtml(s) + '"' + (state.source === s ? ' selected' : '') + '>' + escapeHtml(s) + ' (' + cnt + ')</option>';
    });
    html += '    </select>';
    html += '  </div>';
    html += '</div>';

    // Table — no Lower Bound / Gap columns, add Source column
    var columns = [
      { key: 'id', label: 'Instance' },
      { key: 'source', label: 'Source' },
      { key: 'size', label: 'Size' },
      { key: 'tours', label: 'Tours' },
      { key: 'legs', label: 'Legs' },
      { key: 'bks', label: 'BKS' },
      { key: 'best_algorithm', label: 'Best Algorithm' }
    ];

    html += '<div class="collection-table-wrapper">';
    html += '<table class="collection-table">';
    html += '<thead><tr>';
    columns.forEach(function (col) {
      var arrow = '';
      if (state.sortColumn === col.key) {
        arrow = state.sortAscending ? ' \u25B2' : ' \u25BC';
      }
      html += '<th class="sortable" data-table="patat" data-sort="' + col.key + '">' + col.label + arrow + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (sorted.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" style="text-align:center;">No instances match.</td></tr>';
    }

    sorted.forEach(function (inst) {
      html += '<tr>';
      html += '<td><a href="bdsp_instance.html?instance=' + encodeURIComponent(inst.name) + '">' + escapeHtml(inst.name) + '</a></td>';
      html += '<td>' + escapeHtml(inst.source || '\u2014') + '</td>';
      html += '<td class="num">' + inst.size + '</td>';
      html += '<td class="num">' + inst.tours + '</td>';
      html += '<td class="num">' + inst.legs + '</td>';
      html += '<td class="num">' + formatNumber(inst.bks) + '</td>';
      html += '<td>' + escapeHtml(inst.best_algorithm || '\u2014') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function bindEvents() {
    // Sort headers
    document.querySelectorAll('.collection-table .sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var tbl = this.getAttribute('data-table');
        var col = this.getAttribute('data-sort');
        var state = tableState[tbl];
        if (state.sortColumn === col) {
          state.sortAscending = !state.sortAscending;
        } else {
          state.sortColumn = col;
          state.sortAscending = true;
        }
        render();
      });
    });

    // Search inputs
    document.querySelectorAll('.table-search').forEach(function (input) {
      input.addEventListener('input', function () {
        var tbl = this.getAttribute('data-table');
        tableState[tbl].search = this.value;
        render();
        // Restore focus
        var el = document.querySelector('.table-search[data-table="' + tbl + '"]');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    });

    // Status filter buttons (realistic)
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tbl = this.getAttribute('data-table');
        tableState[tbl].status = this.getAttribute('data-status');
        render();
      });
    });

    // Source filter dropdown (patat)
    document.querySelectorAll('.source-filter').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var tbl = this.getAttribute('data-table');
        tableState[tbl].source = this.value;
        render();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------

  window.exportCollectionCSV = function () {
    var rows = [['Instance', 'Source', 'Status', 'Size', 'Tours', 'Legs', 'BKS', 'Lower Bound', 'Gap (%)', 'Best Algorithm']];
    allInstances.forEach(function (inst) {
      rows.push([
        inst.name,
        inst.source || '',
        inst.status,
        inst.size,
        inst.tours,
        inst.legs,
        inst.bks != null ? inst.bks : '',
        inst.lower_bound != null ? inst.lower_bound : '',
        inst.gap_pct != null ? inst.gap_pct : '',
        inst.best_algorithm || ''
      ]);
    });

    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'bdsp_instances.csv';
    link.click();
  };

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', loadData);

})();
