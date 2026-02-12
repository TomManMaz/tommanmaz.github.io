/**
 * BDSP Instance Detail Page
 * Reads ?instance=realistic_10_1 from URL and displays full details.
 */

(function () {
  'use strict';

  var featuresVisible = false;

  function getInstanceName() {
    var params = new URLSearchParams(window.location.search);
    return params.get('instance');
  }

  function findInstance(name) {
    var data = window.BDSP_INSTANCES || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].name === name) return data[i];
    }
    return null;
  }

  function getInstanceIndex(name) {
    var data = window.BDSP_INSTANCES || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].name === name) return i;
    }
    return -1;
  }

  function formatNum(val, decimals) {
    if (val == null) return '\u2014';
    if (decimals !== undefined) return val.toFixed(decimals);
    if (Number.isInteger(val)) return val.toLocaleString('en-US');
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render() {
    var container = document.getElementById('instance-content');
    var name = getInstanceName();

    if (!name) {
      container.innerHTML = '<p>No instance specified. <a href="bdsp.html#best-known-solutions">Return to collection</a>.</p>';
      return;
    }

    var inst = findInstance(name);
    if (!inst) {
      container.innerHTML = '<p>Instance "' + escapeHtml(name) + '" not found. <a href="bdsp.html#best-known-solutions">Return to collection</a>.</p>';
      return;
    }

    document.getElementById('page-title').textContent = inst.name + ' - BDSP Instance Details';

    var html = '';

    // Header
    var badgeClass = inst.status === 'optimal' ? 'badge-optimal' : 'badge-open';
    html += '<div class="instance-header">';
    html += '  <h1>' + escapeHtml(inst.name) + '</h1>';
    html += '  <span class="status-badge ' + badgeClass + '">' + inst.status + '</span>';
    html += '</div>';

    // Summary cards
    html += '<div class="summary-grid">';
    html += summaryCard('Size', inst.size);
    html += summaryCard('Tours', inst.tours);
    html += summaryCard('Legs', inst.legs);
    html += summaryCard('Stations', inst.stations);
    html += summaryCard('BKS', formatNum(inst.bks), inst.status === 'optimal');
    html += summaryCard('Lower Bound', inst.lower_bound != null ? formatNum(inst.lower_bound) : '\u2014');
    html += summaryCard('Gap (%)', inst.gap_pct != null ? formatNum(inst.gap_pct, 2) : '\u2014', inst.gap_pct === 0);
    html += summaryCard('Best Algorithm', inst.best_algorithm || '\u2014');
    html += '</div>';

    // Algorithm comparison
    html += '<h2>Algorithm Comparison</h2>';
    html += renderAlgorithmTable(inst);

    // Features section
    html += '<h2>';
    html += '<span class="features-toggle" onclick="toggleFeatures()">Instance Features &#9660;</span>';
    html += '</h2>';
    html += '<div id="features-section" style="display:none;">';
    html += renderFeatures(inst.features || {});
    html += '</div>';

    // Downloads
    html += '<h2>Downloads</h2>';
    html += '<div class="download-links">';
    html += '<a class="download-btn" href="downloads/instances/' + encodeURIComponent(inst.name) + '.json" download>Instance JSON</a>';
    html += '<a class="download-btn" href="sols/' + encodeURIComponent(inst.name) + '.csv" download>Best Solution (CSV)</a>';
    html += '<a class="download-btn" href="downloads/collection.tar.gz">Full Archive</a>';
    html += '<a class="download-btn" href="docs/bdsp_problem_formulation.pdf">Problem Formulation (PDF)</a>';
    html += '</div>';

    // Nav between instances
    html += renderInstanceNav(inst.name);

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Summary card
  // ---------------------------------------------------------------------------

  function summaryCard(label, value, isOptimal) {
    var cls = isOptimal ? ' optimal' : '';
    return '<div class="summary-card">' +
      '<div class="label">' + label + '</div>' +
      '<div class="value' + cls + '">' + value + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Algorithm table
  // ---------------------------------------------------------------------------

  function renderAlgorithmTable(inst) {
    var html = '';
    html += '<div style="overflow-x:auto;">';
    html += '<table class="algo-table">';
    html += '<thead><tr>';
    html += '<th>Algorithm</th><th>Best</th><th>Mean</th><th>Std</th><th>Median</th><th>Worst</th><th>Runs</th><th>Best Time (s)</th><th>Gap to BKS (%)</th>';
    html += '</tr></thead><tbody>';

    var bks = inst.bks;

    // New algorithms (from JAIR experiments)
    var algoKeys = Object.keys(inst.algorithms || {});
    // Sort alphabetically
    algoKeys.sort();

    if (algoKeys.length > 0) {
      html += '<tr><td colspan="9" class="algo-section-label">LNS Variants (JAIR 2025)</td></tr>';
      algoKeys.forEach(function (key) {
        var a = inst.algorithms[key];
        var isBest = bks != null && a.best_value === bks;
        var rowClass = isBest ? ' class="best-row"' : '';
        var gap = bks != null && bks > 0 ? ((a.best_value - bks) / bks * 100) : null;
        html += '<tr' + rowClass + '>';
        html += '<td>' + escapeHtml(key) + '</td>';
        html += '<td>' + formatNum(a.best_value) + '</td>';
        html += '<td>' + formatNum(a.mean_value) + '</td>';
        html += '<td>' + formatNum(a.std_value, 2) + '</td>';
        html += '<td>' + formatNum(a.median_value) + '</td>';
        html += '<td>' + formatNum(a.worst_value) + '</td>';
        html += '<td>' + a.runs + '</td>';
        html += '<td>' + (a.best_time != null ? formatNum(a.best_time, 2) : '\u2014') + '</td>';
        html += '<td>' + (gap != null ? formatNum(gap, 2) : '\u2014') + '</td>';
        html += '</tr>';
      });
    }

    // Old algorithms
    var oldAlgos = inst.old_algorithms || {};
    var oldKeys = Object.keys(oldAlgos);
    if (oldKeys.length > 0) {
      html += '<tr><td colspan="9" class="algo-section-label">Previous Algorithms</td></tr>';
      oldKeys.forEach(function (key) {
        var val = oldAlgos[key];
        var isBest = bks != null && val === bks;
        var rowClass = isBest ? ' class="best-row"' : '';
        var gap = bks != null && bks > 0 ? ((val - bks) / bks * 100) : null;
        html += '<tr' + rowClass + '>';
        html += '<td>' + escapeHtml(key) + '</td>';
        html += '<td>' + formatNum(val) + '</td>';
        html += '<td colspan="5">\u2014</td>';
        html += '<td>\u2014</td>';
        html += '<td>' + (gap != null ? formatNum(gap, 2) : '\u2014') + '</td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // Features
  // ---------------------------------------------------------------------------

  var FEATURE_GROUPS = [
    {
      title: 'Counts',
      keys: ['n_tours', 'n_legs', 'n_position_used']
    },
    {
      title: 'Drive Time Statistics',
      keys: ['drive_min', 'drive_max', 'drive_mean', 'drive_median', 'drive_std', 'drive_first_quantile', 'drive_third_quartile']
    },
    {
      title: 'Inter-leg Gap Statistics',
      keys: ['diff_min', 'diff_max', 'diff_mean', 'diff_median', 'diff_std', 'diff_first_quantile', 'diff_third_quartile']
    },
    {
      title: 'Structure',
      keys: ['max_active_buses', 'average_distance']
    },
    {
      title: 'Leg Size Categories (proportions)',
      keys: ['huge', 'large', 'medium', 'small', 'tiny']
    },
    {
      title: 'Legs per Tour',
      keys: ['num_legs_per_tour_max', 'num_legs_per_tour_min', 'num_legs_per_tour_mean', 'num_legs_per_tour_median', 'num_legs_per_tour_std', 'num_legs_per_tour_q1', 'num_legs_per_tour_q3']
    },
    {
      title: 'Total Time per Tour',
      keys: ['total_time_per_tour_max', 'total_time_per_tour_min', 'total_time_per_tour_mean', 'total_time_per_tour_median', 'total_time_per_tour_std', 'total_time_per_tour_q1', 'total_time_per_tour_q3']
    },
    {
      title: 'Breaks per Tour',
      keys: ['number_breaks_per_tour_max', 'number_breaks_per_tour_min', 'number_breaks_per_tour_mean', 'number_breaks_per_tour_median', 'number_breaks_per_tour_std', 'number_breaks_per_tour_q1', 'number_breaks_per_tour_q3']
    },
    {
      title: 'Proper Breaks per Tour (\u226515 min)',
      keys: ['number_proper_breaks_per_tour_max', 'number_proper_breaks_per_tour_min', 'number_proper_breaks_per_tour_mean', 'number_proper_breaks_per_tour_median', 'number_proper_breaks_per_tour_std', 'number_proper_breaks_per_tour_q1', 'number_proper_breaks_per_tour_q3']
    },
    {
      title: 'Proportion of Large Legs per Tour (>120 min)',
      keys: ['proportion_large_legs_per_tour_max', 'proportion_large_legs_per_tour_min', 'proportion_large_legs_per_tour_mean', 'proportion_large_legs_per_tour_median', 'proportion_large_legs_per_tour_std', 'proportion_large_legs_per_tour_q1', 'proportion_large_legs_per_tour_q3']
    }
  ];

  function prettyFeatureName(key) {
    // Strip group prefix for per-tour stats to show just the stat name
    var shortNames = {
      'n_tours': 'Tours', 'n_legs': 'Legs', 'n_position_used': 'Positions used',
      'max_active_buses': 'Max active buses', 'average_distance': 'Avg distance'
    };
    if (shortNames[key]) return shortNames[key];

    // For per-tour stats, show just the suffix
    var suffixes = ['_max', '_min', '_mean', '_median', '_std', '_q1', '_q3'];
    for (var i = 0; i < suffixes.length; i++) {
      if (key.endsWith(suffixes[i])) {
        return suffixes[i].replace('_', '').toUpperCase();
      }
    }

    return key.replace(/_/g, ' ');
  }

  function formatFeatureValue(val) {
    if (val == null) return '\u2014';
    if (Number.isInteger(val)) return val.toString();
    return val.toFixed(4);
  }

  function renderFeatures(features) {
    if (!features || Object.keys(features).length === 0) {
      return '<p>No features available.</p>';
    }

    var html = '';
    FEATURE_GROUPS.forEach(function (group) {
      html += '<div class="features-group">';
      html += '<h4>' + group.title + '</h4>';
      html += '<div class="features-grid">';
      group.keys.forEach(function (key) {
        if (features[key] !== undefined) {
          html += '<div class="feature-item">';
          html += '<span class="fname">' + prettyFeatureName(key) + '</span>';
          html += '<span class="fval">' + formatFeatureValue(features[key]) + '</span>';
          html += '</div>';
        }
      });
      html += '</div></div>';
    });
    return html;
  }

  // ---------------------------------------------------------------------------
  // Instance navigation (prev/next)
  // ---------------------------------------------------------------------------

  function renderInstanceNav(name) {
    var data = window.BDSP_INSTANCES || [];
    var idx = getInstanceIndex(name);
    var html = '<div class="instance-nav">';

    if (idx > 0) {
      html += '<a href="bdsp_instance.html?instance=' + encodeURIComponent(data[idx - 1].name) + '">&larr; ' + escapeHtml(data[idx - 1].name) + '</a>';
    } else {
      html += '<span></span>';
    }

    if (idx < data.length - 1) {
      html += '<a href="bdsp_instance.html?instance=' + encodeURIComponent(data[idx + 1].name) + '">' + escapeHtml(data[idx + 1].name) + ' &rarr;</a>';
    } else {
      html += '<span></span>';
    }

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // Toggle features
  // ---------------------------------------------------------------------------

  window.toggleFeatures = function () {
    var section = document.getElementById('features-section');
    var toggle = document.querySelector('.features-toggle');
    if (!section) return;
    featuresVisible = !featuresVisible;
    section.style.display = featuresVisible ? 'block' : 'none';
    if (toggle) {
      toggle.innerHTML = 'Instance Features ' + (featuresVisible ? '&#9650;' : '&#9660;');
    }
  };

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', render);

})();
