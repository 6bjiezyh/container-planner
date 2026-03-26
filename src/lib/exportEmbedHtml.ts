import type { ContainerPlan } from './containerPlanner'

type ExportEmbedHtmlOptions = {
  title: string
  subtitle?: string
  plan: ContainerPlan
}

export function exportPlanAsStandaloneHtml({
  title,
  subtitle,
  plan,
}: ExportEmbedHtmlOptions) {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1e8;
        --card: rgba(255,255,255,0.88);
        --line: rgba(57,40,26,0.14);
        --ink: #201811;
        --muted: #6c6157;
        --accent: #ea8b4e;
        --accent-deep: #b85e2b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
        background: radial-gradient(circle at top, #fdfbf7 0%, var(--bg) 70%);
        color: var(--ink);
      }
      .shell {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.9fr);
        gap: 20px;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--card);
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 48px rgba(43,30,19,0.08);
        padding: 20px;
      }
      h1 {
        margin: 0;
        font-size: 32px;
      }
      .subtitle {
        margin-top: 8px;
        color: var(--muted);
        font-size: 15px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
      }
      .metric {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.72);
      }
      .metric span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 4px;
      }
      .metric strong {
        font-size: 20px;
      }
      canvas {
        width: 100%;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: #fbf8f2;
        display: block;
      }
      .actions {
        margin-top: 14px;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), #eea16d);
        color: white;
        padding: 10px 16px;
        font-weight: 700;
        cursor: pointer;
      }
      button.secondary {
        background: rgba(255,255,255,0.86);
        color: var(--ink);
        border: 1px solid var(--line);
      }
      .legend,
      .sequence {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .legend-item,
      .sequence-item {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255,255,255,0.72);
        padding: 12px 14px;
      }
      .legend-item strong,
      .sequence-item strong {
        display: block;
        margin-bottom: 4px;
      }
      .sequence-item small,
      .legend-item small,
      .note {
        color: var(--muted);
      }
      .progress {
        color: var(--accent-deep);
        font-weight: 700;
      }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; }
        .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle ?? '装柜方案独立预览文件')}</p>
        <div class="summary">
          <div class="metric"><span>货柜</span><strong>${escapeHtml(plan.containerType)}</strong></div>
          <div class="metric"><span>货柜尺寸</span><strong>${plan.container.lengthCm}×${plan.container.widthCm}×${plan.container.heightCm}cm</strong></div>
          <div class="metric"><span>利用率</span><strong>${(plan.summary.utilizationRatio * 100).toFixed(1)}%</strong></div>
          <div class="metric"><span>装入件数</span><strong>${plan.placements.length}/${plan.summary.totalUnits}</strong></div>
        </div>
        <canvas id="plan-canvas" width="960" height="640"></canvas>
        <div class="actions">
          <button id="replay">重播动画</button>
          <button id="download" class="secondary">下载当前截图</button>
          <span class="progress" id="progress"></span>
        </div>
      </section>
      <aside class="panel">
        <div class="legend">
          <div class="legend-item">
            <strong>说明</strong>
            <small>本文件可单独打开，也可嵌入独立站 iframe，用于演示装柜顺序与货柜利用率。</small>
          </div>
          <div class="legend-item">
            <strong>包装口径</strong>
            <small>结果基于当前项目中的包装规则、扩尺、支撑与分柜策略自动生成。</small>
          </div>
        </div>
        <div class="sequence" id="sequence"></div>
      </aside>
    </main>
    <script>
      const plan = ${JSON.stringify(plan)};
      const canvas = document.getElementById('plan-canvas');
      const context = canvas.getContext('2d');
      const progress = document.getElementById('progress');
      const sequence = document.getElementById('sequence');
      const MARGIN = 56;
      const colors = ['#ef8a4f','#f0b26f','#d7765f','#c69f77','#9ea7c3','#91b6aa','#d79b9e','#bea18e'];
      let frame = 0;
      let timer = null;

      function draw(visibleCount) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f4f1e8';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = '#201811';
        context.font = '700 28px Georgia';
        context.fillText(plan.containerType + ' 装柜方案', MARGIN, 40);
        context.font = '400 16px Georgia';
        context.fillStyle = '#6c6157';
        context.fillText('Utilization ' + (plan.summary.utilizationRatio * 100).toFixed(1) + '%', MARGIN, 68);

        const containerWidth = canvas.width - MARGIN * 2;
        const containerHeight = ((canvas.height - 190) * plan.container.widthCm) / plan.container.lengthCm;
        const originX = MARGIN;
        const originY = 108;

        context.fillStyle = '#ebe3d1';
        context.strokeStyle = '#1d1b18';
        context.lineWidth = 3;
        roundRect(originX, originY, containerWidth, containerHeight, 16);
        context.fill();
        context.stroke();

        const visiblePlacements = plan.placements.slice(0, visibleCount);
        visiblePlacements.forEach((placement, index) => {
          const x = originX + (placement.xCm / plan.container.lengthCm) * containerWidth;
          const y = originY + (placement.yCm / plan.container.widthCm) * containerHeight;
          const width = (placement.lengthCm / plan.container.lengthCm) * containerWidth;
          const height = (placement.widthCm / plan.container.widthCm) * containerHeight;
          context.fillStyle = colors[index % colors.length];
          context.strokeStyle = '#17120f';
          context.lineWidth = 2;
          roundRect(x, y, width, height, 8);
          context.fill();
          context.stroke();
          context.fillStyle = '#17120f';
          context.font = '600 12px Menlo';
          context.fillText(String(index + 1), x + 8, y + 18);
        });

        progress.textContent = '当前进度：' + visibleCount + ' / ' + plan.placements.length;
        renderSequence(visibleCount);
      }

      function renderSequence(visibleCount) {
        sequence.innerHTML = '';
        plan.placements.forEach((placement, index) => {
          const item = document.createElement('div');
          item.className = 'sequence-item';
          item.style.opacity = index < visibleCount ? '1' : '0.55';
          item.innerHTML = '<strong>步骤 ' + (index + 1) + ' · ' + escapeHtml(placement.label) + '</strong>' +
            '<small>' +
              (placement.piNo ? 'PI ' + escapeHtml(placement.piNo) + ' · ' : '') +
              (placement.productCode ? '产品编码 ' + escapeHtml(placement.productCode) + ' · ' : '') +
              (placement.boxNo ? '箱号 ' + escapeHtml(placement.boxNo) + ' · ' : '') +
              '箱数 ' + placement.boxCount +
              ' · 录入数量 ' + placement.declaredQuantity +
            '</small>' +
            '<small>' + placement.lengthCm + '×' + placement.widthCm + '×' + placement.heightCm + 'cm · layer ' + (placement.layer + 1) + '</small>';
          sequence.appendChild(item);
        });
      }

      function startAnimation() {
        if (timer) window.clearInterval(timer);
        frame = 0;
        draw(0);
        timer = window.setInterval(() => {
          frame += 1;
          draw(Math.min(frame, plan.placements.length));
          if (frame >= plan.placements.length) {
            window.clearInterval(timer);
            timer = null;
          }
        }, 420);
      }

      function roundRect(x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      document.getElementById('replay').addEventListener('click', startAnimation);
      document.getElementById('download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'container-plan-preview.png';
        link.click();
      });

      draw(0);
      startAnimation();
    </script>
  </body>
</html>`

  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
