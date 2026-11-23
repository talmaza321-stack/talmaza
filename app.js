
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { renderAccounts } from "./accounts.js";
let scanner = null;

// SUPABASE CONNECTION
const SUPABASE_URL = "https://zacekktcxyvcpwsaxmfp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1rM-kgZfUYBldq6LVlpmkA__JRtHKhA";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_ANON_KEY.startsWith("YOUR_");

const db = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// HELPERS
const $ = (s) => document.querySelector(s);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const today = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

// APPLICATION STATE
let me = null;
let tab = "home";
let questions = [];
let answers = {};
let reportRows = [];

const roles = {
  student: "طالب",
  owner: "مسؤول الفصل",
  main: "المدير الرئيسي",
};

const classes = {
  first: "أولى تلمذة",
  second: "تانية تلمذة",
  third: "تالتة تلمذة"
};

const usernameEmail = (u) =>
  `${u.toLowerCase()}@accounts.motabaati.invalid`;

function toast(message) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = message;
  el.style.display = "block";

  setTimeout(() => {
    el.style.display = "none";
  }, 3200);
}

const card = (body, cls = "") =>
  `<section class="card ${cls}">${body}</section>`;

function classSelect(id, all = true) {
  return `
    <select id="${id}">
      ${all
      ? '<option value="all">كل الفصول</option>'
      : ""
    }
      ${Object.entries(classes)
      .map(
        ([key, name]) =>
          `<option value="${key}">${name}</option>`,
      )
      .join("")}
    </select>
  `;
}

// SUPABASE
async function loadMe() {
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError) throw authError;
  if (!user) return null;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

async function loadQuestions() {
  const { data, error } = await db
    .from("questions")
    .select("*")
    .order("sort_order");

  if (error) throw error;

  questions = data || [];
}

// AUTHENTICATION
async function enter() {
  me = await loadMe();

  if (!me) {
    await db.auth.signOut();
    throw Error("الحساب ده مش متفعل. كلم المسؤول.");
  }

  await loadQuestions();

  $("#login").classList.add("hidden");
  $("#shell").classList.remove("hidden");

  $("#greeting").textContent =
    `أهلاً يا ${me.full_name}`;

  $("#roleLabel").textContent =
    roles[me.role] +
    (me.class_key
      ? " • " + classes[me.class_key]
      : "");

  tab = "home";

  await render();
}


$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();

  $("#loginError").textContent = "";

  if (!configured) {
    $("#loginError").textContent =
      "Please configure Supabase first.";
    return;
  }

  const username = $("#username").value.trim().toLowerCase();
  const password = $("#password").value;

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const isUsername = /^[a-z0-9_.-]{3,32}$/.test(username);

  if (!isEmail && !isUsername) {
    $("#loginError").textContent =
      "Please enter a valid username or email address.";
    return;
  }

  try {
    const loginEmail = isEmail
      ? username
      : usernameEmail(username);

    const { error } = await db.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) throw error;

    await enter();
  } catch (err) {
    console.error("Login error:", err);

    $("#loginError").textContent =
      "تعذر تسجيل الدخول. تأكد من اسم المستخدم أو البريد الإلكتروني وكلمة المرور.";
  }
};

  await stopScanner();

  await db.auth.signOut();

  me = null;

  $("#shell").classList.add("hidden");
  $("#login").classList.remove("hidden");

// NAVIGATION
function navItems() {
  if (me.role === "student") {
    return [
      ["home", "⌂", "الرئيسية"],
      ["form", "▤", "المتابعة"],
      ["history", "◷", "نشاطي"],
    ];
  }

  if (me.role === "owner") {
    return [
      ["home", "⌂", "الرئيسية"],
      ["students", "♙", "الطلبة"],
      ["reports", "▤", "التقارير"],
      ["attendance", "▦", "الحضور"],
    ];
  }

  return [
    ["home", "⌂", "الرئيسية"],
    ["students", "♙", "الحسابات"],
    ["reports", "▤", "التقارير"],
    ["settings", "⚙", "الإعدادات"],
    ["attendance", "▦", "الحضور"],
  ];
}

async function render() {
  await stopScanner();

  const nav = navItems();

  if (!nav.some((item) => item[0] === tab)) {
    tab = "home";
  }

  $("#nav").innerHTML = nav
    .map(
      ([key, icon, name]) => `
        <button
          class="nav-btn ${tab === key ? "active" : ""}"
          data-tab="${key}"
        >
          <span class="symbol">${icon}</span>
          ${name}
        </button>
      `,
    )
    .join("");

  $("#nav")
    .querySelectorAll("button")
    .forEach((button) => {
      button.onclick = async () => {
        tab = button.dataset.tab;
        await render();
      };
    });

  const v = $("#view");

  v.innerHTML =
    '<div class="card">ثواني بنحمّل...</div>';

  try {
    switch (tab) {
      case "home":
        await home(v);
        break;

      case "form":
        await form(v);
        break;

      case "history":
        await history(v);
        break;

      case "students":
        await students(v);
        break;

      case "reports":
        await reports(v);
        break;

      case "settings":
        await settings(v);
        break;

      case "attendance":
        await attendancePage(v);
        break;
    }
  } catch (e) {
    v.innerHTML = card(
      `حصلت مشكلة: ${esc(e.message)}`,
      "error",
    );
  }
}

// STUDENT AND OWNER HOMEPAGE
async function home(v) {
  if (me.role === "student") {
    const { data: sub, error: subError } = await db
      .from("submissions")
      .select("id,submitted_on,earned_points")
      .eq("student_id", me.id)
      .order("submitted_on", { ascending: false })
      .limit(6);

    if (subError) throw subError;

    const { data: all, error: allError } = await db
      .from("submissions")
      .select("earned_points")
      .eq("student_id", me.id);

    if (allError) throw allError;

    const { data: att, error: attError } = await db
      .from("attendance")
      .select("attended_on,points_awarded")
      .eq("student_id", me.id)
      .order("attended_on", { ascending: false });

    if (attError) throw attError;

    const formPoints = (all || []).reduce(
      (sum, item) =>
        sum + Number(item.earned_points || 0),
      0,
    );

    const attendancePoints = (att || []).reduce(
      (sum, item) =>
        sum + Number(item.points_awarded || 0),
      0,
    );

    const total = formPoints + attendancePoints;

    v.innerHTML =
      card(
        `
          <div class="eyebrow">مجموع نقطك</div>
          <div class="big-number">
            ${total.toLocaleString("ar-EG")}
          </div>
          <p class="muted">
            كل يوم فرصة جديدة تعمل حاجة حلوة ✨
          </p>
        `,
        "hero",
      ) +

      `<h3 class="section-title">آخر نشاط ليك</h3>` +

      card(
        (sub || []).length
          ? sub
            .map(
              (s) => `
                  <div class="row item">
                    <div>
                      <b>${esc(s.submitted_on)}</b>
                      <div class="tiny">متابعة اليوم</div>
                    </div>
                    <span class="pill">
                      +${s.earned_points} نقطة
                    </span>
                  </div>
                `,
            )
            .join("")
          : '<div class="empty">لسه مفيش متابعة. يلا نبدأ!</div>',
      ) +

      `<h3 class="section-title">جبت نقطك إزاي؟</h3>` +

      card(`
        <div class="breakdown-row">
          <span>المتابعة الروحية</span>
          <b>${formPoints} نقطة</b>
        </div>
        <div class="breakdown-row">
          <span>حضور الاجتماع</span>
          <b>${attendancePoints} نقطة</b>
        </div>
      `) +

      `<h3 class="section-title">كود الحضور بتاعك</h3>` +

      card(`
        <div class="qr-panel">
          <p class="muted">
            ورّي الكود للمسؤول يوم الجمعة
          </p>

          <div class="qr-frame" id="studentQR"></div>

          <button
            class="secondary soft-button"
            id="downloadQR"
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

    $("#goForm").onclick = async () => {
      tab = "form";
      await render();
    };

    await renderStudentQR();

    return;
  }

  const { data: profiles, error: profilesError } =
    await db
      .from("profiles")
      .select("id,role,class_key");

  if (profilesError) throw profilesError;

  const { data: subs, error: subsError } =
    await db
      .from("submissions")
      .select("id,submitted_on");

  if (subsError) throw subsError;

  const count = (profiles || []).filter(
    (p) => p.role === "student",
  ).length;

  const todayCount = (subs || []).filter(
    (s) => s.submitted_on === today(),
  ).length;

  v.innerHTML =
    card(
      `
        <div class="eyebrow">لوحة المتابعة</div>
        <h2>كل حاجة في مكان واحد.</h2>
        <p class="muted">
          ${me.role === "main"
        ? "تابع الفصول كلها وتحكم في النظام."
        : "تابع طلبة فصلك واطبع تقاريرهم."
      }
        </p>
      `,
      "hero",
    ) +

    `<div class="grid">
      ${card(
      `<strong>${count}</strong>
         <span class="tiny">طالب</span>`,
      "stat",
    )}

      ${card(
      `<strong>${todayCount}</strong>
         <span class="tiny">متابعة النهارده</span>`,
      "stat",
    )}
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

  $("#goReports").onclick = async () => {
    tab = "reports";
    await render();
  };
}

// DAILY SPIRITUAL FOLLOW-UP
async function form(v) {
  if (me.role !== "student") return;

  const { data: existing, error: existingError } =
    await db
      .from("submissions")
      .select("id")
      .eq("student_id", me.id)
      .eq("submitted_on", today())
      .maybeSingle();

  if (existingError) throw existingError;

  let old = [];

  if (existing) {
    const { data, error } = await db
      .from("submission_answers")
      .select("question_id,answer")
      .eq("submission_id", existing.id);

    if (error) throw error;
    old = data || [];
  }

  answers = Object.fromEntries(
    old.map((a) => [a.question_id, a.answer]),
  );

  const activeQuestions = questions.filter(
    (q) => q.active,
  );

  v.innerHTML = `
    <h2>متابعة النهارده</h2>
    <p class="muted">
      جاوب على الأسئلة براحتك 🤍
    </p>

    <div id="qs">
      ${activeQuestions
      .map((q, index) =>
        card(`
            <div class="question">
              <h3>
                ${index + 1}. ${esc(q.title)}
              </h3>

              <div class="choices">
                ${q.options
            .map(
              (option) => `
                      <button
                        type="button"
                        class="choice ${answers[q.id] === option
                  ? "selected"
                  : ""
                }"
                        data-q="${q.id}"
                        data-a="${esc(option)}"
                      >
                        ${esc(option)}
                      </button>
                    `,
            )
            .join("")}
              </div>
            </div>
          `),
      )
      .join("")}
    </div>

    <button class="primary full" id="save">
      ${existing
      ? "حدّث المتابعة"
      : "احفظ المتابعة"
    } ←
    </button>

    <p class="tiny">
      تقدر تعدّل إجاباتك النهارده.
      النقط بتتحسب تلقائي.
    </p>
  `;

  $("#qs").onclick = (e) => {
    const button = e.target.closest("[data-q]");

    if (!button) return;

    const questionId = button.dataset.q;

    answers[questionId] = button.dataset.a;

    document
      .querySelectorAll(`[data-q="${questionId}"]`)
      .forEach((item) => {
        item.classList.toggle(
          "selected",
          item === button,
        );
      });
  };

  $("#save").onclick = async () => {
    if (
      activeQuestions.some(
        (q) => !answers[q.id],
      )
    ) {
      toast("جاوب على كل الأسئلة الأول");
      return;
    }

    $("#save").disabled = true;

    try {
      const payload = activeQuestions.map(
        (q) => ({
          question_id: q.id,
          answer: answers[q.id],
        }),
      );

      const { error } = await db.rpc(
        "save_daily_submission",
        {
          p_answers: payload,
        },
      );

      if (error) throw error;

      toast("اتحفظت متابعتك بنجاح ✨");

      tab = "home";
      await render();
    } catch (e) {
      toast(e.message);
      $("#save").disabled = false;
    }
  };
}

// STUDENT HISTORY
async function history(v) {
  if (me.role !== "student") return;

  const { data: subs, error } = await db
    .from("submissions")
    .select(
      "id,submitted_on,earned_points,submission_answers(answer,question_id)",
    )
    .eq("student_id", me.id)
    .order("submitted_on", { ascending: false })
    .limit(100);

  if (error) throw error;

  v.innerHTML =
    `<h2>نشاطي</h2>
     <p class="muted">كل اللي سجلته قبل كده</p>` +

    ((subs || [])
      .map((s) =>
        card(`
          <div class="row">
            <b>${esc(s.submitted_on)}</b>
            <span class="pill">
              ${s.earned_points} نقطة
            </span>
          </div>

          <div class="space"></div>

          ${(s.submission_answers || [])
            .map((a) => {
              const q = questions.find(
                (x) => x.id === a.question_id,
              );

              return `
                <div class="row item">
                  <span>
                    ${esc(q?.title || "سؤال")}
                  </span>
                  <b>${esc(a.answer)}</b>
                </div>
              `;
            })
            .join("")}
        `),
      )
      .join("") ||
      card('<div class="empty">لسه مفيش نشاط</div>'));
}

// ACCOUNTS MANAGEMENT
// The full implementation is now in accounts.js
async function students(v) {
  return renderAccounts(v, {
    db,
    me,
    classes,
    roles,
    esc,
    card,
    $,
    toast,
    render,
    classSelect,
  });
}

// REPORTS
async function reports(v) {
  const allowed = me.role === "main";

  v.innerHTML =
    `<h2>التقارير</h2>
     <p class="muted">
       شوف نشاط الطلبة واطبع التقرير PDF
     </p>` +

    card(`
      <div class="toolbar">
        <label>
          الفصل

          ${allowed
        ? classSelect("reportClass")
        : `<input
                   value="${esc(classes[me.class_key])}"
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

    try {
      const { data, error } = await db.rpc(
        "class_report",
        {
          p_class: cls,
          p_from: from,
          p_to: to,
        },
      );

      if (error) throw error;

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
              ${reportRows
          .map(
            (r) => `
                      <tr>
                        <td>${esc(r.full_name)}</td>
                        <td>
                          ${esc(classes[r.class_key])}
                        </td>
                        <td>${Number(r.days_count)}</td>
                        <td>${Number(r.total_points)}</td>
                      </tr>
                    `,
          )
          .join("") ||
        `<tr>
                   <td colspan="4">
                     مفيش بيانات
                   </td>
                 </tr>`
        }
            </tbody>
          </table>
        </div>
      `);

      $("#printReport").onclick = () =>
        window.print();
    } catch (e) {
      toast(e.message);
    }
  };
}

// MAIN ADMIN SETTINGS
async function settings(v) {
  if (me.role !== "main") return;

  v.innerHTML =
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

    questions
      .map((q) =>
        card(`
          <div class="row">
            <b>${esc(q.title)}</b>
            <span class="pill">
              ${q.active ? "مفعّل" : "متوقف"}
            </span>
          </div>

          <div class="stack" style="margin-top:12px">
            ${q.options
            .map(
              (option) => `
                  <label>
                    ${esc(option)}
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="1"
                      data-id="${q.id}"
                      data-option="${esc(option)}"
                      value="${Number(q.points?.[option] || 0)}"
                    >
                  </label>
                `,
            )
            .join("")}

            <label>
              <input
                type="checkbox"
                data-active="${q.id}"
                ${q.active ? "checked" : ""}
                style="width:auto;min-height:auto"
              >
              السؤال ده يظهر للطلبة
            </label>
          </div>
        `),
      )
      .join("") +

    `<button class="primary full" id="saveSettings">
      احفظ التعديلات ←
    </button>`;

  const { data: attendanceSetting, error: settingError } =
    await db
      .from("attendance_settings")
      .select("points")
      .eq("id", 1)
      .single();

  if (settingError) throw settingError;

  $("#attendancePointsSetting").value =
    attendanceSetting.points;

  $("#saveSettings").onclick = async () => {
    const button = $("#saveSettings");
    button.disabled = true;

    try {
      const attendanceValue = Number(
        $("#attendancePointsSetting").value,
      );

      if (
        !Number.isInteger(attendanceValue) ||
        attendanceValue < 0 ||
        attendanceValue > 10000
      ) {
        throw Error("راجع نقط الحضور");
      }

      const updates = questions.map((q) => {
        const points = {};

        document
          .querySelectorAll(`[data-id="${q.id}"]`)
          .forEach((input) => {
            const value = Number(input.value);

            if (
              !Number.isInteger(value) ||
              value < 0 ||
              value > 10000
            ) {
              throw Error(
                "النقط لازم تكون رقم صحيح بين ٠ و١٠٠٠٠",
              );
            }

            points[input.dataset.option] = value;
          });

        const active = document.querySelector(
          `[data-active="${q.id}"]`,
        ).checked;

        return {
          id: q.id,
          points,
          active,
        };
      });

      const { error: attendanceError } = await db
        .from("attendance_settings")
        .update({ points: attendanceValue })
        .eq("id", 1);

      if (attendanceError) throw attendanceError;

      for (const update of updates) {
        const { error } = await db
          .from("questions")
          .update({
            points: update.points,
            active: update.active,
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      await loadQuestions();

      toast("الإعدادات اتحفظت");
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  };
}

// QR CODE LIBRARY
async function ensureScript(url, globalName) {
  if (window[globalName]) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = url;
    script.onload = resolve;

    script.onerror = () =>
      reject(
        Error(
          "افتح الموقع بالنت مرة عشان نحمل أداة الكود",
        ),
      );

    document.head.append(script);
  });
}

// STUDENT QR
async function renderStudentQR() {
  const el = $("#studentQR");

  if (!el) return;

  try {
    await ensureScript(
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
      "QRCode",
    );

    const canvas = document.createElement("canvas");

    const qrContainer = document.createElement("div");

new window.QRCode(qrContainer, {
  text: `TALMAZA:${me.id}`,
  width: 210,
  height: 210,
  correctLevel: window.QRCode.CorrectLevel.M,
});

const qrImage = qrContainer.querySelector("img");
const qrCanvas = qrContainer.querySelector("canvas");

if (qrImage) {
  canvas.replaceWith(qrImage);
} else if (qrCanvas) {
  canvas.replaceWith(qrCanvas);
}

    el.replaceChildren(canvas);

    $("#downloadQR").onclick = () => {
      const link = document.createElement("a");

      link.href = canvas.toDataURL("image/png");
      link.download = "كود-الحضور.png";

      link.click();
    };
  } catch (e) {
    el.textContent = e.message;
  }
}

// OFFLINE ATTENDANCE STORAGE
const queueKey = () =>
  `talmaza-attendance-${me?.id || "none"}`;

function pendingQueue() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(queueKey()) || "[]",
    );

    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storeQueue(queue) {
  localStorage.setItem(
    queueKey(),
    JSON.stringify(queue),
  );
}

function cairoFriday() {
  const date = today();

  return (
    new Date(`${date}T12:00:00Z`).getUTCDay() === 5
  );
}

// QR SCANNER

let scanBusy = false;
let syncingAttendance = false;

async function stopScanner() {
  if (!scanner) return;

  const current = scanner;
  scanner = null;

  try {
    await current.stop();
  } catch { }

  try {
    current.clear();
  } catch { }
}

async function queueScan(raw) {
  if (scanBusy) return;

  scanBusy = true;

  try {
    const match =
      /^TALMAZA:([0-9a-f-]{36})$/i.exec(
        String(raw).trim(),
      );

    if (!match) {
      throw Error(
        "الكود ده مش تابع لمتابعتي",
      );
    }

    if (!cairoFriday()) {
      throw Error(
        "الحضور بيتسجل يوم الجمعة بس",
      );
    }

    const studentId = match[1].toLowerCase();
    const date = today();

    const queue = pendingQueue();

    const duplicate = queue.some(
      (item) =>
        item.student_id === studentId &&
        item.attended_on === date,
    );

    if (duplicate) {
      toast(
        "الطالب ده متسجل بالفعل ومستني المزامنة",
      );
      return;
    }

    queue.push({
      student_id: studentId,
      attended_on: date,
      client_recorded_at:
        new Date().toISOString(),
    });

    storeQueue(queue);

    toast("اتحفظ الحضور على الموبايل");

    updatePendingUI();

    if (navigator.onLine) {
      await syncAttendance();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    setTimeout(() => {
      scanBusy = false;
    }, 1600);
  }
}

// ATTENDANCE SYNCHRONIZATION
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

  const queue = pendingQueue();

  if (!queue.length) {
    updatePendingUI();
    return;
  }

  syncingAttendance = true;

  const remaining = [];
  let successCount = 0;

  try {
    for (const item of queue) {
      try {
        const { error } = await db.rpc(
          "record_attendance",
          {
            p_student_id: item.student_id,
            p_attended_on: item.attended_on,
            p_client_recorded_at:
              item.client_recorded_at,
          },
        );

        if (error) throw error;

        successCount++;
      } catch (e) {
        remaining.push({
          ...item,
          error: e.message,
        });
      }
    }

    storeQueue(remaining);

    updatePendingUI();

    if (successCount) {
      toast(
        `اتزامن ${successCount} حضور بنجاح`,
      );
    }

    if (remaining.length) {
      toast(
        `${remaining.length} حضور لسه مستني المزامنة أو المراجعة`,
      );
    }
  } finally {
    syncingAttendance = false;
  }
}

function updatePendingUI() {
  const el = $("#pendingAttendance");

  if (!el) return;

  el.textContent =
    `${pendingQueue().length} حضور مستني المزامنة`;
}

// OWNER ATTENDANCE PAGE
async function attendancePage(v) {
  if (
    !["owner", "main"].includes(me.role)
  ) {
    return;
  }

  v.innerHTML =
    `<h2>تسجيل الحضور</h2>

     <p class="muted">
       اجتماع الجمعة • من ٣ لـ ٥،
       والتسجيل متاح بعد ٥ كمان
     </p>` +

    card(`
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

      <button
        id="startScan"
        class="primary full"
      >
        افتح الكاميرا
      </button>

      <button
        id="stopScan"
        class="secondary soft-button"
      >
        اقفل الكاميرا
      </button>
    `) +

    card(`
      <h3>المزامنة</h3>

      <p
        class="pending-count"
        id="pendingAttendance"
      ></p>

      <button
        id="syncNow"
        class="secondary soft-button"
      >
        زامن الحضور دلوقتي
      </button>

      <p class="hint">
        متعملش تسجيل خروج أو تمسح
        بيانات المتصفح قبل ما العدد يبقى صفر.
      </p>
    `);

  updatePendingUI();

  $("#syncNow").onclick = syncAttendance;

  $("#stopScan").onclick = stopScanner;

  $("#startScan").onclick = async () => {
    try {
      await ensureScript(
        "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
        "Html5Qrcode",
      );

      if (scanner) return;

      scanner = new window.Html5Qrcode(
        "qrScanner",
      );

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: {
            width: 220,
            height: 220,
          },
        },
        queueScan,
      );
    } catch (e) {
      toast(
        "الكاميرا مش متاحة: افتح الموقع على HTTPS واسمح بالكاميرا",
      );

      await stopScanner();
    }
  };

  if (navigator.onLine) {
    syncAttendance();
  }
}

// PASSWORD VISIBILITY
document.addEventListener("click", (e) => {
  const button = e.target.closest(
    "[data-toggle-password]",
  );

  if (!button) return;

  const input = document.getElementById(
    button.dataset.togglePassword,
  );

  if (!input) return;

  const isHidden =
    input.type === "password";

  input.type = isHidden
    ? "text"
    : "password";

  button.setAttribute(
    "aria-label",
    isHidden
      ? "إخفاء كلمة السر"
      : "إظهار كلمة السر",
  );

  button.textContent = isHidden
    ? "◌"
    : "◉";
});

// NETWORK RESTORED
window.addEventListener("online", () => {
  if (
    me &&
    ["owner", "main"].includes(me.role)
  ) {
    syncAttendance();
  }
});

// SERVICE WORKER
if (
  "serviceWorker" in navigator &&
  location.protocol !== "file:"
) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => { });
}

// APPLICATION INITIALIZATION
(async () => {
  if (!configured) {
    $("#loginError").textContent =
      "الموقع جاهز للربط: حط رابط Supabase والمفتاح العام في app.js";
    return;
  }

  try {
    const {
      data: { session },
      error,
    } = await db.auth.getSession();

    if (error) throw error;

    if (session) {
      await enter();
    }
  } catch (e) {
    toast(
      "مقدرناش نفتح الحساب. جرّب تدخل تاني",
    );
  }
})();
