
const PDF_LIBRARIES = [
  {
    url: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    global: "html2canvas"
  },
  {
    url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    global: "jspdf"
  }
];

const loading = new Map();

async function loadLibrary(url, globalName) {
  if (window[globalName]) return;

  if (loading.has(url)) return loading.get(url);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    script.onload = () => {
      if (window[globalName]) resolve();
      else reject(new Error(`Library unavailable: ${globalName}`));
    };

    script.onerror = () => {
      script.remove();
      reject(new Error("Could not load the PDF library."));
    };

    document.head.appendChild(script);
  });

  loading.set(url, promise);

  try {
    await promise;
  } catch (error) {
    loading.delete(url);
    throw error;
  }
}

async function loadPdfLibraries() {
  for (const library of PDF_LIBRARIES) {
    await loadLibrary(library.url, library.global);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ar-EG");
}

function createCell(text, header = false) {
  const cell = document.createElement(header ? "th" : "td");
  cell.textContent = String(text ?? "");
  Object.assign(cell.style, {
    padding: "10px 8px",
    borderBottom: "1px solid #ddd",
    textAlign: "right",
    fontSize: "14px",
    overflowWrap: "anywhere",
    background: header ? "#f1f2f4" : "#fff"
  });
  return cell;
}

function createPageShell(className, from, to, pageNumber) {
  const page = document.createElement("div");
  page.dir = "rtl";
  page.lang = "ar";

  Object.assign(page.style, {
    width: "794px",
    height: "1123px",
    boxSizing: "border-box",
    padding: "45px 42px",
    background: "#fff",
    color: "#111",
    fontFamily: "Tahoma, Arial, sans-serif",
    position: "relative",
    overflow: "hidden"
  });

  page.innerHTML = `
    <header style="text-align:center;border-bottom:2px solid #222;padding-bottom:16px;margin-bottom:20px">
      <h1 style="font-size:30px;margin:0">تلمذة</h1>
      <h2 style="font-size:18px;margin:8px 0">تقرير المتابعة الروحية</h2>
      <p style="font-size:13px;color:#555;margin:5px 0">
        ${escapeHtml(className)} | ${escapeHtml(from)} — ${escapeHtml(to)}
      </p>
    </header>
    <div class="pdf-table-container"></div>
    <footer style="position:absolute;bottom:25px;left:42px;right:42px;text-align:center;color:#777;font-size:11px">
      Talmaza • Page ${pageNumber}
    </footer>
  `;

  return page;
}

function createTable() {
  const table = document.createElement("table");

  Object.assign(table.style, {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    direction: "rtl"
  });

  const thead = document.createElement("thead");
  const heading = document.createElement("tr");

  for (const title of [
    "اسم الطالب",
    "الفصل",
    "أيام المتابعة",
    "مجموع النقط"
  ]) {
    heading.appendChild(createCell(title, true));
  }

  thead.appendChild(heading);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  return { table, tbody };
}

function createStudentRow(row, classes) {
  const tr = document.createElement("tr");

  for (const value of [
    row.full_name,
    classes[row.class_key] || "",
    formatNumber(row.days_count),
    formatNumber(row.total_points)
  ]) {
    tr.appendChild(createCell(value));
  }

  return tr;
}

function createSummary(rows) {
  const totalPoints = rows.reduce(
    (sum, row) => sum + Number(row.total_points || 0),
    0
  );

  const totalDays = rows.reduce(
    (sum, row) => sum + Number(row.days_count || 0),
    0
  );

  const summary = document.createElement("div");

  summary.style.cssText = `
    border-top:2px solid #222;
    padding-top:15px;
    margin-top:20px;
    display:flex;
    justify-content:space-between;
    gap:12px;
    font-size:13px;
    font-weight:bold;
  `;

  summary.textContent = "";

  for (const text of [
    `عدد الطلبة: ${formatNumber(rows.length)}`,
    `أيام المتابعة: ${formatNumber(totalDays)}`,
    `إجمالي النقط: ${formatNumber(totalPoints)}`
  ]) {
    const span = document.createElement("span");
    span.textContent = text;
    summary.appendChild(span);
  }

  return summary;
}

export async function downloadReportPdf({
  rows,
  className,
  from,
  to,
  classes
}) {
  await loadPdfLibraries();

  const container = document.createElement("div");

  Object.assign(container.style, {
    position: "fixed",
    left: "-12000px",
    top: "0",
    width: "794px",
    background: "#fff",
    zIndex: "-1"
  });

  document.body.appendChild(container);

  try {
    let pageNumber = 1;
    let page = createPageShell(className, from, to, pageNumber);
    let { table, tbody } = createTable();

    page.querySelector(".pdf-table-container").appendChild(table);
    container.appendChild(page);

    const maximumTableBottom = 1020;

    for (const row of rows) {
      const tr = createStudentRow(row, classes);
      tbody.appendChild(tr);

      if (table.getBoundingClientRect().bottom >
          page.getBoundingClientRect().top + maximumTableBottom) {
        tbody.removeChild(tr);

        pageNumber++;
        page = createPageShell(className, from, to, pageNumber);

        const next = createTable();
        table = next.table;
        tbody = next.tbody;

        page.querySelector(".pdf-table-container").appendChild(table);
        container.appendChild(page);

        tbody.appendChild(tr);
      }
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = createCell("مفيش بيانات");
      emptyCell.colSpan = 4;
      emptyCell.style.textAlign = "center";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    let summary = createSummary(rows);
    page.querySelector(".pdf-table-container").appendChild(summary);

    if (summary.getBoundingClientRect().bottom >
        page.getBoundingClientRect().top + maximumTableBottom) {
      summary.remove();

      pageNumber++;
      page = createPageShell(className, from, to, pageNumber);
      container.appendChild(page);

      summary = createSummary(rows);
      page.querySelector(".pdf-table-container").appendChild(summary);
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pages = [...container.children];

    for (let index = 0; index < pages.length; index++) {
      if (index > 0) pdf.addPage();

      const canvas = await window.html2canvas(pages[index], {
        scale: 1.5,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        windowWidth: 794
      });

      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.9),
        "JPEG",
        0,
        0,
        210,
        297
      );
    }

    const safeClassName = className
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-");

    pdf.save(`Talmaza-${safeClassName}-${from}-to-${to}.pdf`);
  } finally {
    container.remove();
  }
}
