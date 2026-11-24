
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { renderAccounts } from "./accounts.js";

// =====================================================
// SUPABASE CONNECTION
// =====================================================

const SUPABASE_URL = "https://zacekktcxyvcpwsaxmfp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1rM-kgZfUYBldq6LVlpmkA__JRtHKhA";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_ANON_KEY.startsWith("YOUR_");

const db = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// =====================================================
// HELPERS
// =====================================================

const $ = selector => document.querySelector(selector);

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function today() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type =>
    parts.find(part => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function cairoFriday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "long"
  }).format(new Date()) === "Friday";
}

function number(value) {
  return Number(value || 0);
}

function formatPoints(value) {
  return number(value).toLocaleString("ar-EG");
}

function card(body, cls = "") {
  return `<section class="card ${cls}">${body}</section>`;
}

function classSelect(id, all = true) {
  return `
    <select id="${id}">
      ${all ? '<option value="all">كل الفصول</option>' : ""}
      ${Object.entries(classes).map(([key, name]) =>
        `<option value="${key}">${name}</option>`
      ).join("")}
    </select>
  `;
}

let toastTimer = null;

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = String(message);
  element.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 3500);
}

function checkResult(result) {
  if (result.error) throw result.error;
  return result.data;
}

// =====================================================
// APPLICATION STATE
// =====================================================

let me = null;
let tab = "home";
let questions = [];
let reportRows = [];

let scanner = null;
let scanBusy = false;
let syncingAttendance = false;
let renderVersion = 0;

const roles = {
  student: "طالب",
  owner: "مسؤول الفصل",
  main: "المدير الرئيسي"
};

const classes = {
  first: "أولى تلمذة",
  second: "تانية تلمذة",
  third: "تالتة تلمذة"
};

const usernameEmail = username =>
  `${username.toLowerCase()}@accounts.motabaati.invalid`;

// =====================================================
// DATA LOADING
// =====================================================

async function loadMe() {
  const {
    data: { user },
    error
  } = await db.auth.getUser();

  if (error) throw error;
  if (!user) return null;

  return checkResult(
    await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
  );
}

async function loadQuestions() {
  questions = checkResult(
    await db
      .from("questions")
      .select("*")
      .order("sort_order")
  ) || [];
}

// =====================================================
// AUTHENTICATION
// =====================================================

async function enter() {
  const [profile, questionResult] = await Promise.all([
    loadMe(),
    db.from("questions").select("*").order("sort_order")
  ]);

  if (!profile) {
    throw Error("الحساب ده مش متفعل. كلم المسؤول.");
  }

  me = profile;
  questions = checkResult(questionResult) || [];

  $("#login").classList.add("hidden");
  $("#shell").classList.remove("hidden");

  $("#greeting").textContent = `أهلاً يا ${me.full_name}`;

  $("#roleLabel").textContent =
    (roles[me.role] || me.role) +
    (me.class_key
      ? " • " + (classes[me.class_key] || "")
      : "");

  tab = "home";
  await render();
}

const loginForm = $("#loginForm");

if (loginForm) {
  loginForm.onsubmit = async event => {
    event.preventDefault();

    const errorElement = $("#loginError");
    const submitButton = loginForm.querySelector(
      'button[type="submit"]'
    );

    errorElement.textContent = "";

    if (!configured) {
      errorElement.textContent =
        "Please configure Supabase first.";
      return;
    }

    const username = $("#username").value.trim().toLowerCase();
    const password = $("#password").value;

    const isEmail =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);

    const isUsername =
      /^[a-z0-9_.-]{3,32}$/.test(username);

    if (!isEmail && !isUsername) {
      errorElement.textContent =
        "Please enter a valid username or email address.";
      return;
    }

    if (!password) {
      errorElement.textContent = "من فضلك اكتب كلمة السر";
      return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
      const email = isEmail
        ? username
        : usernameEmail(username);

      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await enter();
    } catch (error) {
      console.error("Login error:", error);

      errorElement.textContent =
        "تعذر تسجيل الدخول: " +
        (error.message || "حاول مرة تانية");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  };
}

async function logout() {
  try {
    await stopScanner();
    await db.auth.signOut();

    renderVersion++;
    me = null;
    questions = [];
    reportRows = [];
    tab = "home";

    $("#shell").classList.add("hidden");
    $("#login").classList.remove("hidden");

    if ($("#password")) $("#password").value = "";
    if ($("#loginError")) $("#loginError").textContent = "";
  } catch (error) {
    console.error("Logout error:", error);
    toast("حصلت مشكلة أثناء تسجيل الخروج");
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest(
    "#logout, #logoutBtn, #signOut, #signOutBtn"
  );

  if (!button) return;

  event.preventDefault();
  logout();
});

// =====================================================
// NAVIGATION
// =====================================================

function navItems() {
  if (me.role === "student") {
    return [
      ["home", "⌂", "الرئيسية"],
      ["form", "▤", "المتابعة"],
      ["history", "◷", "نشاطي"]
    ];
  }

  if (me.role === "owner") {
    return [
      ["home", "⌂", "الرئيسية"],
      ["students", "♙", "الطلبة"],
      ["reports", "▤", "التقارير"],
      ["attendance", "▦", "الحضور"]
    ];
  }

  return [
    ["home", "⌂", "الرئيسية"],
    ["students", "♙", "الحسابات"],
    ["reports", "▤", "التقارير"],
    ["settings", "⚙", "الإعدادات"],
    ["attendance", "▦", "الحضور"]
  ];
}

async function navigate(nextTab) {
  if (tab === nextTab) return;

  tab = nextTab;
  await render();
}

async function render() {
  const version = ++renderVersion;

  await stopScanner();

  if (version !== renderVersion || !me) return;

  const nav = navItems();

  if (!nav.some(([key]) => key === tab)) {
    tab = "home";
  }

  $("#nav").innerHTML = nav.map(([key, icon, name]) => `
    <button
      class="nav-btn ${tab === key ? "active" : ""}"
      data-tab="${key}"
    >
      <span class="symbol">${icon}</span>
      ${name}
    </button>
  `).join("");

  $("#nav").querySelectorAll("button").forEach(button => {
    button.onclick = () => navigate(button.dataset.tab);
  });

  const view = $("#view");

  view.innerHTML =
    '<div class="card">ثواني بنحمّل...</div>';

  try {
    switch (tab) {
      case "home":
        await home(view, version);
        break;
      case "form":
        await form(view, version);
        break;
      case "history":
        await history(view, version);
        break;
      case "students":
        await students(view);
        break;
      case "reports":
        await reports(view);
        break;
      case "settings":
        await settings(view, version);
        break;
      case "attendance":
        await attendancePage(view);
        break;
    }
  } catch (error) {
    if (version !== renderVersion) return;

    console.error("Render error:", error);

    view.innerHTML = card(
      `حصلت مشكلة: ${esc(error.message)}`,
      "error"
    );
  }
}

// =====================================================
// STUDENT HOMEPAGE
// =====================================================

async function studentHome(view, version) {
  const [
    recentResult,
    allResult,
    attendanceResult,
    adjustmentResult
  ] = await Promise.all([
    db
      .from("submissions")
      .select("id,submitted_on,earned_points")
      .eq("student_id", me.id)
      .order("submitted_on", { ascending: false })
      .limit(6),

    db
      .from("submissions")
      .select("earned_points")
      .eq("student_id", me.id),

    db
      .from("attendance")
      .select("points_awarded")
      .eq("student_id", me.id),

    db
      .from("point_adjustments")
      .select("points,reason,created_at")
      .eq("student_id", me.id)
      .order("created_at", { ascending: false })
  ]);

  const recent = checkResult(recentResult) || [];
  const all = checkResult(allResult) || [];
  const attendance = checkResult(attendanceResult) || [];
  const adjustments = checkResult(adjustmentResult) || [];

  if (version !== renderVersion) return;

  const formPoints = all.reduce(
    (sum, item) => sum + number(item.earned_points),
    0
  );

  const attendancePoints = attendance.reduce(
    (sum, item) => sum + number(item.points_awarded),
    0
  );

  const manualPoints = adjustments.reduce(
    (sum, item) => sum + number(item.points),
    0
  );

  const total =
    formPoints + attendancePoints + manualPoints;

  const recentActivity = [
    ...recent.map(item => ({
      date: item.submitted_on,
      timestamp: `${item.submitted_on}T12:00:00`,
      title: "متابعة اليوم",
      points: number(item.earned_points)
    })),

    ...adjustments.map(item => ({
      date: new Date(item.created_at).toLocaleDateString(
        "ar-EG",
        { timeZone: "Africa/Cairo" }
      ),
      timestamp: item.created_at,
      title: item.reason
        ? `تعديل نقط: ${item.reason}`
        : "تعديل نقط من المسؤول",
      points: number(item.points)
    }))
  ]
    .sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    )
    .slice(0, 6);

  view.innerHTML =
    card(`
      <div class="eyebrow">مجموع نقطك</div>

      <div class="big-number">
        ${formatPoints(total)}
      </div>

      <p class="muted">
        كل يوم فرصة جديدة تعمل حاجة حلوة ✨
      </p>
    `, "hero") +

    `<h3 class="section-title">آخر نشاط ليك</h3>` +

    card(
      recentActivity.length
        ? recentActivity.map(item => `
            <div class="row item">
              <div>
                <b>${esc(item.date)}</b>
                <div class="tiny">
                  ${esc(item.title)}
                </div>
              </div>

              <span class="pill">
                ${item.points > 0 ? "+" : ""}
                ${formatPoints(item.points)} نقطة
              </span>
            </div>
          `).join("")
        : '<div class="empty">لسه مفيش نشاط. يلا نبدأ!</div>'
    ) +

    `<h3 class="section-title">جبت نقطك إزاي؟</h3>` +

    card(`
      <div class="breakdown-row">
        <span>المتابعة الروحية</span>
        <b>${formatPoints(formPoints)} نقطة</b>
      </div>

      <div class="breakdown-row">
        <span>حضور الاجتماع</span>
        <b>${formatPoints(attendancePoints)} نقطة</b>
      </div>

      <div class="breakdown-row">
        <span>تعديلات المسؤول</span>
        <b>
          ${manualPoints > 0 ? "+" : ""}
          ${formatPoints(manualPoints)} نقطة
        </b>
      </div>
    `) +

    `<h3 class="section-title">كود الحضور بتاعك</h3>` +

    card(`
      <div class="qr-panel">
        <p class="muted">
          ورّي الكود للمسؤول يوم الجمعة
        </p>

        <div class="qr-frame" id="studentQR">
          <span class="tiny">جاري تجهيز الكود...</span>
        </div>

        <button
          class="secondary soft-button"
          id="downloadQR"
          disabled
        >
          نزّل كود الحضور
        </button>

        <p class="hint">
          تقدر تحفظ الصورة على موبايلك
          وتستخدمها من غير نت
        </p>
      </div>
    `) +

    `<button class="primary full" id="goForm">
      سجّل متابعة النهارده ←
    </button>`;

  $("#goForm").onclick = () => navigate("form");

  renderStudentQR(version);
}

// =====================================================
// MANAGEMENT HOMEPAGE
// =====================================================

async function managementHome(view, version) {
  const profiles = checkResult(
    await db
      .from("profiles")
      .select("id,role,class_key")
  ) || [];

  if (version !== renderVersion) return;

  const students = profiles.filter(profile =>
    profile.role === "student" &&
    (
      me.role === "main" ||
      profile.class_key === me.class_key
    )
  );

  const studentIds = students.map(student => student.id);

  let todayCount = 0;

  if (studentIds.length) {
    const batches = [];

    for (let i = 0; i < studentIds.length; i += 100) {
      batches.push(studentIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      batches.map(ids =>
        db
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("submitted_on", today())
          .in("student_id", ids)
      )
    );

    for (const result of results) {
      if (result.error) throw result.error;
      todayCount += result.count || 0;
    }
  }

  if (version !== renderVersion) return;

  view.innerHTML =
    card(`
      <div class="eyebrow">لوحة المتابعة</div>

      <h2>كل حاجة في مكان واحد.</h2>

      <p class="muted">
        ${
          me.role === "main"
            ? "تابع الفصول كلها وتحكم في النظام."
            : "تابع طلبة فصلك واطبع تقاريرهم."
        }
      </p>
    `, "hero") +

    `<div class="grid">
      ${card(`
        <strong>${students.length}</strong>
        <span class="tiny">طالب</span>
      `, "stat")}

      ${card(`
        <strong>${todayCount}</strong>
        <span class="tiny">متابعة النهارده</span>
      `, "stat")}
    </div>` +

    card(`
      <h3>تقرير الطلبة</h3>

      <p class="muted">
        اختار الفصل واطبع تقرير PDF من قسم التقارير.
      </p>

      <button class="primary full" id="goReports">
        افتح التقارير ←
      </button>
    `);

  $("#goReports").onclick = () => navigate("reports");
}

async function home(view, version) {
  if (me.role === "student") {
    await studentHome(view, version);
  } else {
    await managementHome(view, version);
  }
}

// =====================================================
// DAILY SPIRITUAL FOLLOW-UP
// =====================================================

async function form(view, version) {
  if (me.role !== "student") return;

  const existing = checkResult(
    await db
      .from("submissions")
      .select("id")
      .eq("student_id", me.id)
      .eq("submitted_on", today())
      .maybeSingle()
  );

  let oldAnswers = [];

  if (existing) {
    oldAnswers = checkResult(
      await db
        .from("submission_answers")
        .select("question_id,answer")
        .eq("submission_id", existing.id)
    ) || [];
  }

  if (version !== renderVersion) return;

  const selectedAnswers = Object.fromEntries(
    oldAnswers.map(answer => [
      answer.question_id,
      answer.answer
    ])
  );

  const activeQuestions = questions.filter(
    question => question.active
  );

  view.innerHTML = `
    <h2>متابعة النهارده</h2>

    <p class="muted">
      جاوب على الأسئلة براحتك 🤍
    </p>

    <div id="qs">
      ${activeQuestions.map((question, index) =>
        card(`
          <div class="question">
            <h3>
              ${index + 1}. ${esc(question.title)}
            </h3>

            <div class="choices">
              ${(question.options || []).map(option => `
                <button
                  type="button"
                  class="choice ${
                    selectedAnswers[question.id] === option
                      ? "selected"
                      : ""
                  }"
                  data-q="${esc(question.id)}"
                  data-a="${esc(option)}"
                >
                  ${esc(option)}
                </button>
              `).join("")}
            </div>
          </div>
        `)
      ).join("")}
    </div>

    <button class="primary full" id="save">
      ${existing ? "حدّث المتابعة" : "احفظ المتابعة"} ←
    </button>

    <p class="tiny">
      تقدر تعدّل إجاباتك النهارده.
      النقط بتتحسب تلقائي.
    </p>
  `;

  $("#qs").onclick = event => {
    const button = event.target.closest("[data-q]");
    if (!button) return;

    const questionId = button.dataset.q;
    selectedAnswers[questionId] = button.dataset.a;

    document
      .querySelectorAll(`[data-q="${questionId}"]`)
      .forEach(element => {
        element.classList.toggle(
          "selected",
          element === button
        );
      });
  };

  $("#save").onclick = async () => {
    if (activeQuestions.some(
      question => !selectedAnswers[question.id]
    )) {
      toast("جاوب على كل الأسئلة الأول");
      return;
    }

    const button = $("#save");
    button.disabled = true;

    try {
      const payload = activeQuestions.map(question => ({
        question_id: question.id,
        answer: selectedAnswers[question.id]
      }));

      checkResult(
        await db.rpc("save_daily_submission", {
          p_answers: payload
        })
      );

      toast("اتحفظت متابعتك بنجاح ✨");

      tab = "home";
      await render();
    } catch (error) {
      toast(error.message);

      if ($("#save")) $("#save").disabled = false;
    }
  };
}

// =====================================================
// STUDENT HISTORY
// =====================================================

async function history(view, version) {
  if (me.role !== "student") return;

  const [submissionsResult, adjustmentsResult] =
    await Promise.all([
      db
        .from("submissions")
        .select(
          "id,submitted_on,earned_points,submission_answers(answer,question_id)"
        )
        .eq("student_id", me.id)
        .order("submitted_on", { ascending: false })
        .limit(100),

      db
        .from("point_adjustments")
        .select("points,reason,created_at")
        .eq("student_id", me.id)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

  const submissions = checkResult(submissionsResult) || [];
  const adjustments = checkResult(adjustmentsResult) || [];

  if (version !== renderVersion) return;

  const questionMap = new Map(
    questions.map(question => [
      String(question.id),
      question.title
    ])
  );

  const submissionCards = submissions.map(submission =>
    card(`
      <div class="row">
        <b>${esc(submission.submitted_on)}</b>

        <span class="pill">
          ${formatPoints(submission.earned_points)} نقطة
        </span>
      </div>

      <div class="space"></div>

      ${(submission.submission_answers || []).map(answer => `
        <div class="row item">
          <span>
            ${esc(
              questionMap.get(String(answer.question_id)) ||
              "سؤال"
            )}
          </span>

          <b>${esc(answer.answer)}</b>
        </div>
      `).join("")}
    `)
  ).join("");

  const adjustmentCards = adjustments.map(item => {
    const points = number(item.points);

    const date = new Date(item.created_at)
      .toLocaleString("ar-EG", {
        timeZone: "Africa/Cairo"
      });

    return card(`
      <div class="row">
        <div>
          <b>تعديل نقط من المسؤول</b>

          <div class="tiny">
            ${esc(date)}
          </div>

          ${item.reason ? `
            <p class="muted">
              ${esc(item.reason)}
            </p>
          ` : ""}
        </div>

        <span class="pill">
          ${points > 0 ? "+" : ""}
          ${formatPoints(points)} نقطة
        </span>
      </div>
    `);
  }).join("");

  view.innerHTML = `
    <h2>نشاطي</h2>
    <p class="muted">كل اللي سجلته قبل كده</p>

    <h3 class="section-title">المتابعات</h3>
    ${
      submissionCards ||
      card('<div class="empty">لسه مفيش متابعة</div>')
    }

    <h3 class="section-title">تعديلات النقط</h3>
    ${
      adjustmentCards ||
      card('<div class="empty">مفيش تعديلات نقط</div>')
    }
  `;
}

// =====================================================
// ACCOUNT MANAGEMENT
// =====================================================

async function students(view) {
  return renderAccounts(view, {
    db,
    me,
    classes,
    roles,
    esc,
    card,
    $,
    toast,
    render,
    classSelect
  });
}

// =====================================================
// REPORTS
// =====================================================

async function reports(view) {
  if (!["main", "owner"].includes(me.role)) return;

  const allowed = me.role === "main";

  view.innerHTML =
    `<h2>التقارير</h2>
     <p class="muted">
       شوف نشاط الطلبة واطبع التقرير PDF
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
            تقرير ${esc(classes[cls] || "كل الفصول")}
          </b>

          <button
            class="secondary"
            id="printReport"
          >
            طباعة / PDF
          </button>
        </div>

        <div class="print-only">
          <h2>تقرير المتابعة الروحية</h2>

          <p>
            ${esc(classes[cls] || "كل الفصول")}
            — من ${esc(from)} إلى ${esc(to)}
          </p>
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

      $("#printReport").onclick = () => window.print();
    } catch (error) {
      toast(error.message);
    } finally {
      if ($("#loadReport")) {
        $("#loadReport").disabled = false;
      }
    }
  };
}

// =====================================================
// MAIN ADMIN SETTINGS
// =====================================================

async function settings(view, version) {
  if (me.role !== "main") return;

  view.innerHTML =
    `<h2>إعدادات النقط</h2>

     <p class="muted">
       غيّر النقط لكل إجابة.
       التغيير بيأثر على المتابعات الجديدة،
       ومش بيغيّر النقط القديمة.
     </p>` +

    card(`
      <h3>نقط الحضور</h3>

      <label>
        نقط حضور الجمعة
        <input
          id="attendancePointsSetting"
          type="number"
          min="0"
          max="10000"
          value="0"
        >
      </label>

      <p class="hint">
        النقط الجديدة بتتحسب على الحضور
        اللي بيتسجل بعد التغيير.
      </p>
    `) +

    questions.map(question =>
      card(`
        <div class="row">
          <b>${esc(question.title)}</b>

          <span class="pill">
            ${question.active ? "مفعّل" : "متوقف"}
          </span>
        </div>

        <div class="stack" style="margin-top:12px">
          ${(question.options || []).map(option => `
            <label>
              ${esc(option)}

              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                data-id="${esc(question.id)}"
                data-option="${esc(option)}"
                value="${number(question.points?.[option])}"
              >
            </label>
          `).join("")}

          <label>
            <input
              type="checkbox"
              data-active="${esc(question.id)}"
              ${question.active ? "checked" : ""}
              style="width:auto;min-height:auto"
            >

            السؤال ده يظهر للطلبة
          </label>
        </div>
      `)
    ).join("") +

    `<button class="primary full" id="saveSettings">
      احفظ التعديلات ←
    </button>`;

  const attendanceSetting = checkResult(
    await db
      .from("attendance_settings")
      .select("points")
      .eq("id", 1)
      .single()
  );

  if (version !== renderVersion) return;

  if ($("#attendancePointsSetting")) {
    $("#attendancePointsSetting").value =
      attendanceSetting.points;
  }

  $("#saveSettings").onclick = async () => {
    const button = $("#saveSettings");
    button.disabled = true;

    try {
      const attendanceValue = Number(
        $("#attendancePointsSetting").value
      );

      if (
        !Number.isInteger(attendanceValue) ||
        attendanceValue < 0 ||
        attendanceValue > 10000
      ) {
        throw Error("راجع نقط الحضور");
      }

      const updates = questions.map(question => {
        const points = {};

        document
          .querySelectorAll(`[data-id="${question.id}"]`)
          .forEach(input => {
            const value = Number(input.value);

            if (
              input.value.trim() === "" ||
              !Number.isInteger(value) ||
              value < 0 ||
              value > 10000
            ) {
              throw Error(
                "النقط لازم تكون رقم صحيح بين ٠ و١٠٠٠٠"
              );
            }

            points[input.dataset.option] = value;
          });

        const activeInput = document.querySelector(
          `[data-active="${question.id}"]`
        );

        return {
          id: question.id,
          points,
          active: !!activeInput?.checked
        };
      });

      checkResult(
        await db
          .from("attendance_settings")
          .update({ points: attendanceValue })
          .eq("id", 1)
      );

      for (const update of updates) {
        checkResult(
          await db
            .from("questions")
            .update({
              points: update.points,
              active: update.active
            })
            .eq("id", update.id)
        );
      }

      await loadQuestions();

      toast("الإعدادات اتحفظت");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
}

// =====================================================
// EXTERNAL SCRIPT LOADER
// =====================================================

const loadingScripts = new Map();

async function ensureScript(url, globalName) {
  if (window[globalName]) return;

  if (loadingScripts.has(url)) {
    return loadingScripts.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = url;
    script.async = true;

    script.onload = () => {
      if (window[globalName]) {
        resolve();
      } else {
        reject(Error("أداة الكود اتحملت لكن مش شغالة"));
      }
    };

    script.onerror = () => {
      script.remove();

      reject(
        Error(
          "تعذر تحميل أداة الكود. تأكد من الاتصال بالإنترنت"
        )
      );
    };

    document.head.append(script);
  });

  loadingScripts.set(url, promise);

  try {
    await promise;
  } catch (error) {
    loadingScripts.delete(url);
    throw error;
  }
}

// =====================================================
// STUDENT QR CODE
// =====================================================

async function renderStudentQR(version = renderVersion) {
  const element = $("#studentQR");

  if (!element || !me) return;

  const studentId = me.id;

  try {
    await ensureScript(
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
      "QRCode"
    );

    if (
      version !== renderVersion ||
      !me ||
      me.id !== studentId
    ) {
      return;
    }

    const currentElement = $("#studentQR");

    if (!currentElement || currentElement !== element) {
      return;
    }

    element.replaceChildren();

    new window.QRCode(element, {
      text: `TALMAZA:${studentId}`,
      width: 210,
      height: 210,
      correctLevel: window.QRCode.CorrectLevel.M
    });

    const downloadButton = $("#downloadQR");

    if (downloadButton) {
      downloadButton.disabled = false;

      downloadButton.onclick = () => {
        const canvas = element.querySelector("canvas");
        const image = element.querySelector("img");

        let imageUrl = "";

        if (canvas) {
          imageUrl = canvas.toDataURL("image/png");
        } else if (image) {
          imageUrl = image.src;
        }

        if (!imageUrl) {
          toast("كود الحضور لسه بيتحمّل");
          return;
        }

        const link = document.createElement("a");

        link.href = imageUrl;
        link.download = "كود-الحضور.png";

        document.body.appendChild(link);
        link.click();
        link.remove();
      };
    }
  } catch (error) {
    console.error("QR error:", error);

    if (version !== renderVersion) return;

    const currentElement = $("#studentQR");

    if (currentElement === element) {
      element.textContent =
        "تعذر إنشاء كود الحضور: " + error.message;
    }
  }
}

// =====================================================
// OFFLINE ATTENDANCE STORAGE
// =====================================================

const queueKey = () =>
  `talmaza-attendance-${me?.id || "none"}`;

function pendingQueue() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(queueKey()) || "[]"
    );

    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storeQueue(queue) {
  localStorage.setItem(
    queueKey(),
    JSON.stringify(queue)
  );
}

function updatePendingUI() {
  const element = $("#pendingAttendance");

  if (!element) return;

  element.textContent =
    `${pendingQueue().length} حضور مستني المزامنة`;
}

// =====================================================
// QR SCANNER
// =====================================================

async function stopScanner() {
  if (!scanner) return;

  const current = scanner;
  scanner = null;

  try {
    await current.stop();
  } catch {}

  try {
    current.clear();
  } catch {}
}

async function queueScan(raw) {
  if (scanBusy) return;

  scanBusy = true;

  try {
    if (!me || !["owner", "main"].includes(me.role)) {
      throw Error("مش مسموح بتسجيل الحضور");
    }

    const match =
      /^TALMAZA:([0-9a-f-]{36})$/i.exec(
        String(raw).trim()
      );

    if (!match) {
      throw Error("الكود ده مش تابع لمتابعتي");
    }

    if (!cairoFriday()) {
      throw Error("الحضور بيتسجل يوم الجمعة بس");
    }

    const studentId = match[1].toLowerCase();
    const date = today();

    const queue = pendingQueue();

    const duplicate = queue.some(item =>
      item.student_id === studentId &&
      item.attended_on === date
    );

    if (duplicate) {
      toast("الطالب ده متسجل بالفعل ومستني المزامنة");
      return;
    }

    queue.push({
      student_id: studentId,
      attended_on: date,
      client_recorded_at: new Date().toISOString()
    });

    storeQueue(queue);

    toast("اتحفظ الحضور على الموبايل");
    updatePendingUI();

    if (navigator.onLine) {
      syncAttendance();
    }
  } catch (error) {
    toast(error.message);
  } finally {
    setTimeout(() => {
      scanBusy = false;
    }, 1600);
  }
}

// =====================================================
// ATTENDANCE SYNCHRONIZATION
// =====================================================

async function syncAttendance() {
  if (
    syncingAttendance ||
    !db ||
    !me ||
    !["owner", "main"].includes(me.role) ||
    !navigator.onLine
  ) {
    return;
  }

  const initialQueue = pendingQueue();

  if (!initialQueue.length) {
    updatePendingUI();
    return;
  }

  syncingAttendance = true;

  let successCount = 0;
  let failedCount = 0;

  try {
    for (const item of initialQueue) {
      try {
        checkResult(
          await db.rpc("record_attendance", {
            p_student_id: item.student_id,
            p_attended_on: item.attended_on,
            p_client_recorded_at:
              item.client_recorded_at
          })
        );

        const currentQueue = pendingQueue();

        const remaining = currentQueue.filter(queued =>
          !(
            queued.student_id === item.student_id &&
            queued.attended_on === item.attended_on &&
            queued.client_recorded_at ===
              item.client_recorded_at
          )
        );

        storeQueue(remaining);
        successCount++;
      } catch (error) {
        failedCount++;

        const currentQueue = pendingQueue();

        const updated = currentQueue.map(queued =>
          queued.student_id === item.student_id &&
          queued.attended_on === item.attended_on &&
          queued.client_recorded_at ===
            item.client_recorded_at
            ? { ...queued, error: error.message }
            : queued
        );

        storeQueue(updated);
      }

      updatePendingUI();
    }

    if (successCount) {
      toast(`اتزامن ${successCount} حضور بنجاح`);
    }

    if (failedCount) {
      toast(
        `${failedCount} حضور لسه مستني المزامنة أو المراجعة`
      );
    }
  } finally {
    syncingAttendance = false;
  }
}

// =====================================================
// ATTENDANCE PAGE
// =====================================================

async function attendancePage(view) {
  if (!["owner", "main"].includes(me.role)) return;

  view.innerHTML = `
    <h2>تسجيل الحضور</h2>

    <p class="muted">
      اجتماع الجمعة • من ٣ لـ ٥،
      والتسجيل متاح بعد ٥ كمان
    </p>

    ${card(`
      <h3>امسح كود الطالب</h3>

      <div
        id="qrScanner"
        class="scanner-box"
      ></div>

      <p class="hint">
        اسمح باستخدام الكاميرا.
        لو مفيش نت، الحضور هيتحفظ
        على الجهاز لحد ما النت يرجع.
      </p>

      <button id="startScan" class="primary full">
        افتح الكاميرا
      </button>

      <button id="stopScan" class="secondary soft-button">
        اقفل الكاميرا
      </button>
    `)}

    ${card(`
      <h3>المزامنة</h3>

      <p
        class="pending-count"
        id="pendingAttendance"
      ></p>

      <button id="syncNow" class="secondary soft-button">
        زامن الحضور دلوقتي
      </button>

      <p class="hint">
        متعملش تسجيل خروج أو تمسح
        بيانات المتصفح قبل ما العدد يبقى صفر.
      </p>
    `)}
  `;

  updatePendingUI();

  $("#syncNow").onclick = syncAttendance;
  $("#stopScan").onclick = stopScanner;

  $("#startScan").onclick = async () => {
    const button = $("#startScan");
    button.disabled = true;

    try {
      await ensureScript(
        "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
        "Html5Qrcode"
      );

      if (scanner) return;

      scanner = new window.Html5Qrcode("qrScanner");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: {
            width: 220,
            height: 220
          }
        },
        queueScan
      );
    } catch (error) {
      console.error("Scanner error:", error);

      toast(
        "الكاميرا مش متاحة: تأكد من الاتصال والسماح بالكاميرا"
      );

      await stopScanner();
    } finally {
      if ($("#startScan")) {
        $("#startScan").disabled = false;
      }
    }
  };

  if (navigator.onLine) {
    syncAttendance();
  }
}

// =====================================================
// PASSWORD VISIBILITY
// =====================================================

document.addEventListener("click", event => {
  const button = event.target.closest(
    "[data-toggle-password]"
  );

  if (!button) return;

  const input = document.getElementById(
    button.dataset.togglePassword
  );

  if (!input) return;

  const isHidden = input.type === "password";

  input.type = isHidden ? "text" : "password";

  button.setAttribute(
    "aria-label",
    isHidden ? "إخفاء كلمة السر" : "إظهار كلمة السر"
  );

  button.textContent = isHidden ? "◌" : "◉";
});

// =====================================================
// NETWORK RESTORED
// =====================================================

window.addEventListener("online", () => {
  if (me && ["owner", "main"].includes(me.role)) {
    syncAttendance();
  }
});

// =====================================================
// SERVICE WORKER
// =====================================================

if (
  "serviceWorker" in navigator &&
  location.protocol !== "file:"
) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(error => {
      console.warn("Service worker:", error);
    });
}

// =====================================================
// APPLICATION INITIALIZATION
// =====================================================

(async () => {
  if (!configured) {
    if ($("#loginError")) {
      $("#loginError").textContent =
        "الموقع جاهز للربط: حط رابط Supabase والمفتاح العام في app.js";
    }
    return;
  }

  try {
    const {
      data: { session },
      error
    } = await db.auth.getSession();

    if (error) throw error;

    if (session) {
      await enter();
    }
  } catch (error) {
    console.error("Session restore error:", error);

    toast("مقدرناش نفتح الحساب. جرّب تدخل تاني");
  }
})();
