
export async function renderAccounts(v, {
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
}) {
  const classNames = {
    first: "أولى تلمذة",
    second: "تانية تلمذة",
    third: "تالتة تلمذة"
  };

  const isMain = me.role === "main";
  const isOwner = me.role === "owner";

  if (!isMain && !isOwner) return;

  // ============================================
  // LOAD ACCOUNTS
  // ============================================

  const { data: people, error } = await db
    .from("profiles")
    .select("id,username,full_name,role,class_key")
    .order("full_name");

  if (error) throw error;

  const visiblePeople = (people || []).filter(p =>
    isMain || p.class_key === me.class_key
  );

  const students = visiblePeople.filter(p =>
    p.role === "student"
  );

  const classOptions = Object.entries(classNames)
    .map(([key, name]) =>
      `<option value="${key}">${name}</option>`
    )
    .join("");

  const accountCards = visiblePeople
    .map(p => card(`
      <div class="row">
        <div>
          <b>${esc(p.full_name)}</b>
          <div class="tiny">
            @${esc(p.username || "")} •
            ${esc(classNames[p.class_key] || "كل الفصول")}
          </div>
        </div>

        <span class="pill">
          ${esc(roles[p.role] || p.role)}
        </span>
      </div>
    `))
    .join("");

  // ============================================
  // RENDER PAGE
  // ============================================

  v.innerHTML = `
    <h2>
      ${isMain ? "إدارة الحسابات" : "طلبة الفصل"}
    </h2>

    <p class="muted">
      إدارة الحسابات ونقط الطلبة.
    </p>

    ${card(`
      <h3>إضافة أو خصم نقط</h3>

      <p class="muted">
        اختار الطالب وحدد عدد النقط.
      </p>

      <form id="adjustPointsForm">

        ${isMain ? `
          <label>
            الفصل
            <select id="pointsClass" required>
              ${classOptions}
            </select>
          </label>
        ` : `
          <label>
            الفصل
            <input
              value="${esc(classNames[me.class_key] || "")}"
              disabled
            >
          </label>
        `}

        <label>
          اسم الطالب
          <select id="pointsStudent" required></select>
        </label>

        <div>
          <label>نوع العملية</label>

          <div
            class="points-action-buttons"
            role="group"
            aria-label="نوع تعديل النقط"
          >
            <button
              type="button"
              id="pointsPlus"
              class="points-action plus selected"
              aria-pressed="true"
            >
              <span class="action-symbol">+</span>
              Plus
            </button>

            <button
              type="button"
              id="pointsMinus"
              class="points-action minus"
              aria-pressed="false"
            >
              <span class="action-symbol">−</span>
              Minus
            </button>
          </div>
        </div>

        <label>
          عدد النقط
          <input
            id="pointsAmount"
            type="number"
            min="1"
            max="10000"
            step="1"
            value="5"
            required
          >
        </label>

        <label>
          السبب (اختياري)
          <input
            id="pointsReason"
            type="text"
            maxlength="500"
            placeholder="مثلاً: مشاركة مميزة"
          >
        </label>

        <button
          type="submit"
          class="primary full"
        >
          حفظ تعديل النقط ←
        </button>

      </form>
    `)}

    ${card(`
      <div class="row">
        <h3>سجل تعديلات النقط</h3>

        <button
          type="button"
          class="secondary"
          id="refreshAdjustments"
        >
          تحديث
        </button>
      </div>

      <div id="adjustmentsHistory">
        <div class="tiny">جاري تحميل السجل...</div>
      </div>
    `)}

    <h3 class="section-title">الحسابات</h3>

    ${accountCards || card(
      '<div class="empty">مفيش حسابات لسه</div>'
    )}

    ${card(`
      <h3>إضافة حساب جديد</h3>

      <form id="newAccount">

        <label>
          اسم الطالب / المسؤول
          <input
            name="full_name"
            required
            maxlength="100"
            autocomplete="off"
          >
        </label>

        <label>
          اسم المستخدم (بالإنجليزي)
          <input
            name="username"
            required
            minlength="3"
            maxlength="32"
            placeholder="oliver01"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
          >
        </label>

        <label>
          كلمة السر

          <span class="password-wrap">
            <input
              id="newPassword"
              name="password"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
            >

            <button
              type="button"
              class="eye-toggle"
              data-toggle-password="newPassword"
              aria-label="إظهار كلمة السر"
            >◉</button>
          </span>
        </label>

        ${isMain ? `
          <label>
            نوع الحساب

            <select name="role" id="newRole">
              <option value="student">طالب</option>
              <option value="owner">مسؤول الفصل</option>
            </select>
          </label>

          <label>
            الفصل

            <select
              name="class_key"
              id="newClass"
              required
            >
              ${classOptions}
            </select>
          </label>
        ` : ""}

        <button
          type="submit"
          class="primary full"
        >
          إنشاء الحساب ←
        </button>

      </form>

      <p class="tiny">
        اسم المستخدم من ٣ إلى ٣٢ حرف إنجليزي
        صغير أو رقم أو نقطة أو شرطة.
        كلمة السر ٨ حروف على الأقل.
      </p>
    `)}
  `;

  // ============================================
  // STUDENT SELECTOR
  // ============================================

  const pointsClass = $("#pointsClass");
  const pointsStudent = $("#pointsStudent");

  function updateStudentOptions() {
    const selectedClass = isMain
      ? pointsClass.value
      : me.class_key;

    const filtered = students.filter(p =>
      p.class_key === selectedClass
    );

    pointsStudent.innerHTML = filtered.length
      ? filtered.map(p => `
          <option value="${esc(p.id)}">
            ${esc(p.full_name)}
          </option>
        `).join("")
      : `<option value="">مفيش طلبة في الفصل ده</option>`;
  }

  if (pointsClass) {
    pointsClass.onchange = updateStudentOptions;
  }

  updateStudentOptions();

  // ============================================
  // PLUS / MINUS BUTTONS
  // ============================================

  let selectedAction = "add";

  const plusButton = $("#pointsPlus");
  const minusButton = $("#pointsMinus");

  function selectAction(action) {
    selectedAction = action;

    const plusSelected = action === "add";
    const minusSelected = action === "deduct";

    plusButton.classList.toggle(
      "selected",
      plusSelected
    );

    minusButton.classList.toggle(
      "selected",
      minusSelected
    );

    plusButton.setAttribute(
      "aria-pressed",
      String(plusSelected)
    );

    minusButton.setAttribute(
      "aria-pressed",
      String(minusSelected)
    );
  }

  plusButton.onclick = () => selectAction("add");
  minusButton.onclick = () => selectAction("deduct");

  // ============================================
  // ADJUSTMENT HISTORY
  // ============================================

  const studentMap = new Map(
    students.map(p => [p.id, p])
  );

  async function loadAdjustmentHistory() {
    const container = $("#adjustmentsHistory");

    if (!container) return;

    container.innerHTML =
      '<div class="tiny">جاري تحميل السجل...</div>';

    try {
      const { data, error } = await db
        .from("point_adjustments")
        .select(
          "id,student_id,adjusted_by,points,reason,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!container.isConnected) return;

      const rows = (data || []).filter(item =>
        studentMap.has(item.student_id)
      );

      container.innerHTML = rows.length
        ? rows.map(item => {
            const student = studentMap.get(
              item.student_id
            );

            const amount = Number(item.points);
            const sign = amount > 0 ? "+" : "";

            const date = new Date(
              item.created_at
            ).toLocaleString("ar-EG", {
              timeZone: "Africa/Cairo"
            });

            return `
              <div class="row item">
                <div>
                  <b>${esc(student.full_name)}</b>

                  <div class="tiny">
                    ${esc(
                      classNames[student.class_key] || ""
                    )}
                    • ${esc(date)}
                  </div>

                  ${item.reason ? `
                    <div class="tiny">
                      ${esc(item.reason)}
                    </div>
                  ` : ""}
                </div>

                <span class="pill">
                  ${sign}${esc(amount)} نقطة
                </span>
              </div>
            `;
          }).join("")
        : '<div class="empty">لسه مفيش تعديلات نقط</div>';

    } catch (err) {
      console.error(
        "Adjustment history error:",
        err
      );

      if (container.isConnected) {
        container.innerHTML = `
          <div class="empty">
            تعذر تحميل سجل النقط:
            ${esc(err.message)}
          </div>
        `;
      }
    }
  }

  $("#refreshAdjustments").onclick =
    loadAdjustmentHistory;

  loadAdjustmentHistory();

  // ============================================
  // ADD / DEDUCT POINTS
  // ============================================

  const adjustForm = $("#adjustPointsForm");

  adjustForm.onsubmit = async e => {
    e.preventDefault();

    const studentId = pointsStudent.value;
    const action = selectedAction;

    const rawAmount =
      $("#pointsAmount").value.trim();

    const amount = Number(rawAmount);

    const reason =
      $("#pointsReason").value.trim();

    if (!studentMap.has(studentId)) {
      toast("اختار طالب صحيح");
      return;
    }

    if (
      !rawAmount ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 10000
    ) {
      toast(
        "عدد النقط لازم يكون من ١ إلى ١٠٠٠٠"
      );
      return;
    }

    if (!["add", "deduct"].includes(action)) {
      toast("اختار نوع العملية");
      return;
    }

    const signedPoints = action === "add"
      ? amount
      : -amount;

    const student = studentMap.get(studentId);

    const confirmed = window.confirm(
      `تأكيد ${
        action === "add" ? "إضافة" : "خصم"
      } ${amount} نقطة ${
        action === "add" ? "للطالب" : "من الطالب"
      } ${student.full_name}؟`
    );

    if (!confirmed) return;

    const button = adjustForm.querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;
    button.textContent = "جاري حفظ النقط...";

    try {
      const { error } = await db.rpc(
        "adjust_student_points",
        {
          p_student_id: studentId,
          p_points: signedPoints,
          p_reason: reason
        }
      );

      if (error) throw error;

      toast("تم تعديل النقط بنجاح");

      $("#pointsReason").value = "";
      $("#pointsAmount").value = "5";

      await loadAdjustmentHistory();

    } catch (err) {
      console.error(
        "Points adjustment error:",
        err
      );

      toast(
        "تعذر تعديل النقط: " +
        (err.message || "حاول مرة تانية")
      );

    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent =
          "حفظ تعديل النقط ←";
      }
    }
  };

  // ============================================
  // ACCOUNT CREATION
  // ============================================

  const form = $("#newAccount");

  if (!form) return;

  form.onsubmit = async e => {
    e.preventDefault();

    const btn = form.querySelector(
      'button[type="submit"]'
    );

    const username = form.elements.username
      .value.trim().toLowerCase();

    const password =
      form.elements.password.value;

    const full_name = form.elements.full_name
      .value.trim();

    const role = isMain
      ? form.elements.role.value
      : "student";

    const class_key = isMain
      ? form.elements.class_key.value
      : me.class_key;

    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      toast(
        "اسم المستخدم لازم يكون إنجليزي صغير أو أرقام، من ٣ إلى ٣٢ حرف"
      );
      return;
    }

    if (!full_name) {
      toast("اكتب الاسم الكامل");
      return;
    }

    if (password.length < 8) {
      toast(
        "كلمة السر لازم تكون ٨ حروف على الأقل"
      );
      return;
    }

    if (!["student", "owner"].includes(role)) {
      toast("نوع الحساب غير مسموح");
      return;
    }

    if (
      !["first", "second", "third"].includes(
        class_key
      )
    ) {
      toast("اختار فصل صحيح");
      return;
    }

    btn.disabled = true;
    btn.textContent = "جاري إنشاء الحساب...";

    try {
      const { data, error } =
        await db.functions.invoke(
          "create-user",
          {
            body: {
              username,
              password,
              full_name,
              role,
              class_key
            }
          }
        );

      if (error) {
        let message = error.message;

        if (error.context) {
          try {
            const details =
              await error.context.json();

            message =
              details.error ||
              details.message ||
              message;
          } catch {
            // Keep original error message
          }
        }

        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast("الحساب اتعمل بنجاح");

      await render();

    } catch (err) {
      console.error(
        "Account creation error:",
        err
      );

      toast(
        "مقدرناش ننشئ الحساب: " +
        (err.message || "حاول مرة تانية")
      );

      btn.disabled = false;
      btn.textContent =
        "إنشاء الحساب ←";
    }
  };
}
