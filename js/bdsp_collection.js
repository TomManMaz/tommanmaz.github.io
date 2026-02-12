/**
 * BDSP Collection Table
 * Loads instance data from data/instances.json and renders a sortable,
 * filterable, searchable table. Replaces the old static BKS tables.
 */

(function () {
  'use strict';

  let allInstances = [];
  let sortColumn = 'id';
  let sortAscending = true;
  let filters = { status: 'all', search: '' };

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  function loadData() {
    const container = document.getElementById('collection-table-container');
    if (!container) return;

    // Try inline data first (set by data/instances.js), fall back to fetch
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
  // Filtering
  // ---------------------------------------------------------------------------

  function getFilteredInstances() {
    return allInstances.filter(function (inst) {
      if (filters.status !== 'all' && inst.status !== filters.status) return false;
      if (filters.search) {
        var q = filters.search.toLowerCase();
        if (inst.name.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  function compareValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'string') return a.localeCompare(b);
    return a - b;
  }

  function getInstanceId(name) {
    // Extract trailing number: realistic_10_1 -> 1, realistic_250_65 -> 65
    var parts = name.split('_');
    return parseInt(parts[parts.length - 1], 10) || 0;
  }

  function getSortValue(inst, col) {
    switch (col) {
      case 'id': return getInstanceId(inst.name);
      case 'name': return inst.name;
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

  function sortInstances(instances) {
    var col = sortColumn;
    var asc = sortAscending;
    return instances.slice().sort(function (a, b) {
      var va = getSortValue(a, col);
      var vb = getSortValue(b, col);
      var cmp = compareValues(va, vb);
      return asc ? cmp : -cmp;
    });
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function formatNumber(val) {
    if (val == null) return '—';
    return val.toLocaleString('en-US');
  }

  function formatGap(val) {
    if (val == null) return '—';
    return val.toFixed(2);
  }

  function formatBound(val) {
    if (val == null) return '—';
    if (Number.isInteger(val)) return val.toLocaleString('en-US');
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function render() {
    var container = document.getElementById('collection-table-container');
    if (!container) return;

    var filtered = getFilteredInstances();
    var sorted = sortInstances(filtered);

    // Build controls
    var html = '';
    html += '<div class="collection-controls">';
    html += '  <div class="collection-search">';
    html += '    <input type="text" id="collection-search" placeholder="Search instances..." value="' + escapeHtml(filters.search) + '">';
    html += '  </div>';
    html += '  <div class="collection-filters">';
    html += '    <button class="filter-btn' + (filters.status === 'all' ? ' active' : '') + '" data-status="all">All (' + allInstances.length + ')</button>';
    var optCount = allInstances.filter(function (i) { return i.status === 'optimal'; }).length;
    var openCount = allInstances.filter(function (i) { return i.status === 'open'; }).length;
    html += '    <button class="filter-btn' + (filters.status === 'optimal' ? ' active' : '') + '" data-status="optimal">Optimal (' + optCount + ')</button>';
    html += '    <button class="filter-btn' + (filters.status === 'open' ? ' active' : '') + '" data-status="open">Open (' + openCount + ')</button>';
    html += '  </div>';
    html += '</div>';

    // Build table
    html += '<div class="collection-table-wrapper">';
    html += '<table class="collection-table" id="collectionTable">';
    html += '<thead><tr>';

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

    columns.forEach(function (col) {
      var arrow = '';
      if (sortColumn === col.key) {
        arrow = sortAscending ? ' \u25B2' : ' \u25BC';
      }
      html += '<th class="sortable" data-sort="' + col.key + '">' + col.label + arrow + '</th>';
    });

    html += '</tr></thead><tbody>';

    if (sorted.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" style="text-align:center;">No instances match the current filters.</td></tr>';
    }

    sorted.forEach(function (inst) {
      var rowClass = inst.status === 'optimal' ? ' class="optimal-solution"' : '';
      html += '<tr' + rowClass + '>';

      // Instance name (link)
      html += '<td><a href="bdsp_instance.html?instance=' + encodeURIComponent(inst.name) + '">' + escapeHtml(inst.name) + '</a></td>';

      // Status badge
      var badgeClass = inst.status === 'optimal' ? 'badge-optimal' : 'badge-open';
      html += '<td><span class="status-badge ' + badgeClass + '">' + inst.status + '</span></td>';

      // Size, Tours, Legs
      html += '<td>' + inst.size + '</td>';
      html += '<td>' + inst.tours + '</td>';
      html += '<td>' + inst.legs + '</td>';

      // BKS
      html += '<td>' + formatNumber(inst.bks) + '</td>';

      // Lower Bound
      html += '<td>' + formatBound(inst.lower_bound) + '</td>';

      // Gap
      if (inst.gap_pct != null && inst.gap_pct === 0) {
        html += '<td><span class="gap-optimal">0.00</span></td>';
      } else {
        html += '<td>' + formatGap(inst.gap_pct) + '</td>';
      }

      // Best Algorithm
      html += '<td>' + escapeHtml(inst.best_algorithm || '—') + '</td>';

      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Summary
    html += '<p class="collection-summary">';
    html += 'Showing ' + sorted.length + ' of ' + allInstances.length + ' instances.';
    html += '</p>';

    container.innerHTML = html;

    // Bind events
    bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function bindEvents() {
    // Sort headers
    var headers = document.querySelectorAll('.collection-table .sortable');
    headers.forEach(function (th) {
      th.addEventListener('click', function () {
        var col = this.getAttribute('data-sort');
        if (sortColumn === col) {
          sortAscending = !sortAscending;
        } else {
          sortColumn = col;
          sortAscending = true;
        }
        render();
      });
    });

    // Search
    var searchInput = document.getElementById('collection-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filters.search = this.value;
        render();
        // Restore focus and cursor position
        var input = document.getElementById('collection-search');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }

    // Filter buttons
    var filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.status = this.getAttribute('data-status');
        render();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------

  window.exportCollectionCSV = function () {
    var filtered = getFilteredInstances();
    var sorted = sortInstances(filtered);

    var rows = [['Instance', 'Status', 'Size', 'Tours', 'Legs', 'BKS', 'Lower Bound', 'Gap (%)', 'Best Algorithm']];
    sorted.forEach(function (inst) {
      rows.push([
        inst.name,
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
  // Utility
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', loadData);

})();
