/**
 * BDSP schedule timeline — plain SVG renderer for validated solutions.
 * One row per employee: driving legs as solid bars, passive rides in gray,
 * sign-on/sign-off as ticks, split breaks (>= 3 h) as dashed gaps.
 * No libraries; returns an SVG string. Browser-only (used by bdsp_validate.js).
 */

(function () {
  'use strict';

  var COLOR_LEG = '#0b3d91';
  var COLOR_RIDE = '#bbbbbb';
  var COLOR_TICK = '#111111';
  var COLOR_SPLIT = '#888888';
  var COLOR_AXIS = '#bbbbbb';
  var COLOR_LABEL = '#111111';
  var COLOR_LABEL_BAD = '#b00020';

  var LABEL_W = 44;      // left margin for employee names
  var CONTENT_W = 880;   // drawing width for the time axis
  var AXIS_H = 26;       // top axis band
  var ROW_H = 18;        // per-employee row height
  var BAR_H = 10;        // bar height inside a row
  var PAD_BOTTOM = 6;

  function fmtTime(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }

  // Instance fields (e.g. leg.tour) may come from a user-uploaded JSON and the
  // SVG string is mounted via innerHTML — escape everything interpolated as text.
  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(instance, evaluated) {
    var rows = evaluated.filter(function (ev) { return ev.state.num_legs > 0; });
    if (!rows.length) return '';

    var minT = Infinity, maxT = -Infinity;
    rows.forEach(function (ev) {
      if (ev.state.start_shift < minT) minT = ev.state.start_shift;
      if (ev.state.end_shift > maxT) maxT = ev.state.end_shift;
    });
    if (maxT <= minT) return '';

    var scale = CONTENT_W / (maxT - minT);
    function x(t) { return LABEL_W + (t - minT) * scale; }

    var width = LABEL_W + CONTENT_W + 10;
    var height = AXIS_H + rows.length * ROW_H + PAD_BOTTOM;

    var svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
      '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Employee schedule timeline">');
    svg.push('<style>text{font-family:Georgia,serif;font-size:10px;}</style>');

    // Time axis: ticks every 2 h
    var tickStart = Math.ceil(minT / 120) * 120;
    for (var t = tickStart; t <= maxT; t += 120) {
      var tx = x(t);
      svg.push('<line x1="' + tx.toFixed(1) + '" y1="' + (AXIS_H - 8) + '" x2="' + tx.toFixed(1) +
        '" y2="' + height + '" stroke="' + COLOR_AXIS + '" stroke-width="0.5"/>');
      svg.push('<text x="' + tx.toFixed(1) + '" y="' + (AXIS_H - 12) +
        '" text-anchor="middle" fill="' + COLOR_LABEL + '">' + fmtTime(t) + '</text>');
    }

    rows.forEach(function (ev, r) {
      var s = ev.state;
      var yTop = AXIS_H + r * ROW_H;
      var yBar = yTop + (ROW_H - BAR_H) / 2;
      var yMid = yTop + ROW_H / 2;

      var labelColor = s.feasible ? COLOR_LABEL : COLOR_LABEL_BAD;
      svg.push('<text x="' + (LABEL_W - 6) + '" y="' + (yMid + 3.5) +
        '" text-anchor="end" fill="' + labelColor + '">' + escapeXml(ev.emp.name) + '</text>');

      // sign-on / sign-off ticks (start/end work stubs)
      svg.push('<rect x="' + x(s.start_shift).toFixed(1) + '" y="' + (yBar - 2) +
        '" width="1.5" height="' + (BAR_H + 4) + '" fill="' + COLOR_TICK + '"/>');
      svg.push('<rect x="' + (x(s.end_shift) - 1.5).toFixed(1) + '" y="' + (yBar - 2) +
        '" width="1.5" height="' + (BAR_H + 4) + '" fill="' + COLOR_TICK + '"/>');

      var legs = ev.emp.legs;
      for (var k = 0; k < legs.length; k++) {
        var leg = legs[k];
        var lx = x(leg.start);
        var lw = Math.max((leg.end - leg.start) * scale, 1);
        svg.push('<rect x="' + lx.toFixed(1) + '" y="' + yBar + '" width="' + lw.toFixed(1) +
          '" height="' + BAR_H + '" fill="' + COLOR_LEG + '">' +
          '<title>' + escapeXml(ev.emp.name + ' leg ' + leg.id + ' (tour ' + leg.tour + '): ' +
          fmtTime(leg.start) + '–' + fmtTime(leg.end)) + '</title></rect>');

        if (k < legs.length - 1) {
          var next = legs[k + 1];
          var i = leg.endPos, j = next.startPos;
          var ride = (i === j) ? 0 :
            ((instance.distances[i] && instance.distances[i][j]) ? instance.distances[i][j] : 0);
          var diff = next.start - leg.end;
          if (ride > 0) {
            var rw = Math.max(Math.min(ride, Math.max(diff, 0)) * scale, 1);
            svg.push('<rect x="' + x(leg.end).toFixed(1) + '" y="' + yBar + '" width="' + rw.toFixed(1) +
              '" height="' + BAR_H + '" fill="' + COLOR_RIDE + '">' +
              '<title>' + escapeXml(ev.emp.name + ' passive ride: ' + ride + ' min') + '</title></rect>');
          }
          if (diff - ride >= 180) {
            svg.push('<line x1="' + x(leg.end + ride).toFixed(1) + '" y1="' + yMid +
              '" x2="' + x(next.start).toFixed(1) + '" y2="' + yMid +
              '" stroke="' + COLOR_SPLIT + '" stroke-width="1" stroke-dasharray="4 3"/>');
          }
        }
      }
    });

    svg.push('</svg>');
    return svg.join('');
  }

  if (typeof window !== 'undefined') {
    window.BDSP_GANTT = { render: render };
  }
})();
