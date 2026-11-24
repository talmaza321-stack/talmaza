
// =====================================================
// REPORTS
// =====================================================

// PDF libraries are loaded only when the user downloads.
// html2canvas preserves Arabic text and the report layout.
// jsPDF creates the downloadable A4 PDF.

async function loadPdfLibraries() {
  await ensureScript(
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "html2canvas"
  );

  await ensureScript(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "jspdf"
  );
}

function createPdfReportElement(rows, className, from, to) {
  const totalPoints = rows.reduce(
    (sum, row) => sum + number(row.total_points),
    0
  );

  const totalDays = rows.reduce(
    (sum, row) => sum + number(row.days_count),
    0
  );

  const report = document.createElement("div");

  report.dir = "rtl";
  report.lang = "ar";

  Object.assign(report.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "794px",
    padding: "48px",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#111111",
    fontFamily: "Tahoma, Arial, sans-serif",
    fontSize: "14px",
    lineHeight: "1.8",
    zIndex: "-1"
  });

  report.innerHTML = `
    <div style="
      text-align:center;
      padding-bottom:22px;
      border-bottom:2px solid #222;
      margin-bottom:25px;
    ">
      <h1 style="
        margin:0;
        font-size:32px;
        font-weight:800;
        color:#111;
      ">تلمذة</h1>

      <div style="
        font-size:18px;
        font-weight:600;
        color:#444;
        margin-top:6px;
      ">تقرير المتابعة الروحية</div>

      <div style="
        font-size:13px;
        color:#777;
        margin-top:8px;
      ">
        ${esc(className)}
        &nbsp; | &nbsp;
        ${esc(from)} — ${esc(to)}
      </div>
    </div>

    <table style="
      width:100%;
      border-collapse:collapse;
      table-layout:fixed;
      text-align:right;
      direction:rtl;
    ">
      <thead>
        <tr style="background:#f1f2f4;">
          <th style="
            padding:12px 10px;
            border-bottom:2px solid #ddd;
            width:34%;
          ">اسم الطالب</th>

          <th style="
            padding:12px 10px;
            border-bottom:2px solid #ddd;
            width:26%;
          ">الفصل</th>

          <th style="
            padding:12px 10px;
            border-bottom:2px solid #ddd;
            width:20%;
          ">أيام المتابعة</th>

          <th style="
            padding:12px 10px;
            border-bottom:2px solid #ddd;
            width:20%;
          ">النقط</th>
        </tr>
      </thead>

      <tbody>
        ${
          rows.length
            ? rows.map((row, index) => `
                <tr style="
                  background:${
                    index % 2 === 0
                      ? "#ffffff"
                      : "#fafafa"
                  };
                ">
                  <td style="
                    padding:11px 10px;
                    border-bottom:1px solid #e5e5e5;
                    overflow-wrap:anywhere;
                  ">${esc(row.full_name)}</td>

                  <td style="
                    padding:11px 10px;
                    border-bottom:1px solid #e5e5e5;
                  ">
                    ${esc(classes[row.class_key] || "")}
                  </td>

                  <td style="
                    padding:11px 10px;
                    border-bottom:1px solid #e5e5e5;
                  ">
                    ${formatPoints(row.days_count)}
                  </td>

                  <td style="
                    padding:11px 10px;
                    border-bottom:1px solid #e5e5e5;
                    font-weight:700;
                  ">
                    ${formatPoints(row.total_points)}
                  </td>
                </tr>
              `).join("")
            : `
              <tr>
                <td colspan="4" style="
                  padding:24px;
                  text-align:center;
                  color:#777;
                ">مفيش بيانات</td>
              </tr>
            `
        }
      </tbody>
    </table>

    <div style="
      display:flex;
      justify-content:space-between;
      gap:12px;
      margin-top:26px;
      padding-top:15px;
      border-top:2px solid #222;
      font-size:14px;
      font-weight:700;
    ">
      <span>عدد الطلبة: ${formatPoints(rows.length)}</span>
      <span>أيام المتابعة: ${formatPoints(totalDays)}</span>
      <span>إجمالي النقط: ${formatPoints(totalPoints)}</span>
    </div>

    <div style="
      text-align:center;
      margin-top:36px;
      color:#999;
      font-size:11px;
      direction:ltr;
    ">
      Talmaza • Student Follow-up Report
    </div>
  `;

  return report;
}

async function downloadReportPdf(rows, className, from, to) {
  await loadPdfLibraries();

  const report = createPdfReportElement(
    rows,
    className,
    from,
    to
  );

  document.body.appendChild(report);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await window.html2canvas(report, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 794
    });

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const pxPerMm = canvas.width / contentWidth;
    const pageHeightPx = Math.floor(
      contentHeight * pxPerMm
    );

    let offsetY = 0;
    let pageNumber = 0;

    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(
        pageHeightPx,
        canvas.height - offsetY
      );

      const pageCanvas = document.createElement("canvas");

      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const context = pageCanvas.getContext("2d");

      if (!context) {
        throw Error("تعذر تجهيز صفحة PDF");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      );

      context.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (pageNumber > 0) {
        pdf.addPage();
      }

      const imageHeight = sliceHeight / pxPerMm;

      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        margin,
        margin,
        contentWidth,
        imageHeight
      );

      offsetY += sliceHeight;
      pageNumber++;
    }

    const safeClassName = className
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-");

    pdf.save(
      `Talmaza-${safeClassName}-${from}-to-${to}.pdf`
    );
  } finally {
    report.remove();
  }
}

async function reports(view) {
  if (!["main", "owner"].includes(me.role)) return;

  const allowed = me.role === "main";

  view.innerHTML =
    `<h2>التقارير</h2>
     <p class="muted">
       شوف نشاط الطلبة ونزّل التقرير PDF مباشرة
     </p>` +

    card(`
      <div class="toolbar">
        <label>
          الفصل

          ${
            allowed
              ? classSelect("reportClass")
              : `<input
                   value="${esc(classes[me.class_key] || "")}"
                   disabled
                 >`
          }
        </label>

        <label>
          من يوم
          <input
            type="date"
            id="fromDate"
            value="${today().slice(0, 8)}01"
          >
        </label>

        <label>
          لحد يوم
          <input
            type="date"
            id="toDate"
            value="${today()}"
          >
        </label>
      </div>

      <div class="space"></div>

      <button class="primary full" id="loadReport">
        عرض التقرير ←
      </button>
    `) +

    `<div id="reportResult"></div>`;

  $("#loadReport").onclick = async () => {
    const from = $("#fromDate").value;
    const to = $("#toDate").value;

    if (!from || !to || from > to) {
      toast("راجع التواريخ");
      return;
    }

    const cls = allowed
      ? $("#reportClass").value
      : me.class_key;

    const className = classes[cls] || "كل الفصول";

    const button = $("#loadReport");
    button.disabled = true;

    try {
      const data = checkResult(
        await db.rpc("class_report", {
          p_class: cls,
          p_from: from,
          p_to: to
        })
      );

      reportRows = data || [];

      $("#reportResult").innerHTML = card(`
        <div class="row no-print">
          <b>
            تقرير ${esc(className)}
          </b>

          <button
            class="secondary"
            id="downloadReport"
            type="button"
          >
            ⬇ تنزيل PDF
          </button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الفصل</th>
                <th>أيام المتابعة</th>
                <th>مجموع النقط</th>
              </tr>
            </thead>

            <tbody>
              ${
                reportRows.map(row => `
                  <tr>
                    <td>${esc(row.full_name)}</td>
                    <td>${esc(classes[row.class_key] || "")}</td>
                    <td>${number(row.days_count)}</td>
                    <td>${formatPoints(row.total_points)}</td>
                  </tr>
                `).join("") ||
                `<tr>
                  <td colspan="4">مفيش بيانات</td>
                </tr>`
              }
            </tbody>
          </table>
        </div>
      `);

      // Capture the exact rows and dates shown on screen.
      const currentRows = reportRows.map(row => ({ ...row }));

      $("#downloadReport").onclick = async () => {
        const downloadButton = $("#downloadReport");

        downloadButton.disabled = true;
        downloadButton.textContent = "جاري تجهيز PDF...";

        try {
          await downloadReportPdf(
            currentRows,
            className,
            from,
            to
          );

          toast("تم تجهيز ملف PDF");
        } catch (error) {
          console.error("PDF download error:", error);
          toast(
            "تعذر تنزيل PDF: " +
            (error.message || "حاول مرة تانية")
          );
        } finally {
          if (downloadButton.isConnected) {
            downloadButton.disabled = false;
            downloadButton.textContent = "⬇ تنزيل PDF";
          }
        }
      };
    } catch (error) {
      toast(error.message);
    } finally {
      if ($("#loadReport")) {
        $("#loadReport").disabled = false;
      }
    }
  };
}
