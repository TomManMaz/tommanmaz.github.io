/**
 * QAP landing page: fills the summary line and the "what changed" table
 * from window.QAP_DATA, so both follow the data without hand edits.
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNumber(val) {
    return val == null ? '—' : val.toLocaleString('en-US');
  }

  function referenceLink(data, key) {
    var ref = data.references[key];
    if (!ref) return '';
    return ref.url
      ? '<a href="' + escapeHtml(ref.url) + '" title="' + escapeHtml(ref.text) + '">' + escapeHtml(ref.short) + '</a>'
      : '<span title="' + escapeHtml(ref.text) + '">' + escapeHtml(ref.short) + '</span>';
  }

  function officialCell(entry) {
    var official = entry.qaplib_2012;
    if (!official) return 'not in the table';
    return formatNumber(official.value) + ' (' + official.status + ')';
  }

  function sourceKey(entry) {
    return entry.changes.indexOf('new best known value') !== -1 ? entry.bks_source : entry.proof;
  }

  function renderSummary(data) {
    var el = document.getElementById('qap-summary');
    var total = data.instances.length;
    var open = data.instances.filter(function (e) { return e.status === 'open'; }).length;
    el.innerHTML = total + ' instances &middot; ' + (total - open) + ' proven optimal &middot; ' + open +
      ' open &middot; every best known value backed by a permutation recomputed on the official data.';
  }

  function renderChanges(data) {
    var changed = data.instances.filter(function (e) { return e.changes.length > 0; });
    var html = '<table><thead><tr><th>Instance</th><th>Official table (2012)</th><th>Now</th>' +
      '<th>Change</th><th>Source</th></tr></thead><tbody>';
    changed.forEach(function (e) {
      html += '<tr><td><a href="qap_instance.html?instance=' + encodeURIComponent(e.name) + '">' +
        escapeHtml(e.name) + '</a></td>' +
        '<td>' + officialCell(e) + '</td>' +
        '<td>' + formatNumber(e.bks) + ' (' + e.status + ')</td>' +
        '<td>' + escapeHtml(e.changes.join(', ')) + '</td>' +
        '<td>' + referenceLink(data, sourceKey(e)) + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('qap-changes').innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var data = window.QAP_DATA;
    if (!data) return;
    renderSummary(data);
    renderChanges(data);
  });
})();
