
export async function renderAccounts(v, {
  db, me, classes, roles, esc, card,
  $, toast, render, classSelect
}) {
  // Display names only. Database class IDs stay unchanged.
  const classNames = {
    first: "أولى تلمذة",
    second: "تانية تلمذة",
    third: "تالتة تلمذة"
  };

  const { data: people, error } = await db
    .from("profiles")
    .select("id,username,full_name,role,class_key")
    .order("full_name");

  if (error) throw error;

  const classOptions = Object.entries(classNames)
    .map(([key, name]) => `
      <option value="${key}">${name}</option>
    `)
    .join("");

  v.innerHTML = `
    <h2>${me.role === "main" ? "إدارة الحسابات" : "طلبة الفصل"}</h2>

    <p class="muted">
      الحسابات بتتعمل باسم مستخدم وكلمة سر، من غير إيميل.
    </p>

    ${(people || []).map(p => card(`
      <div class="row">
        <div>
          <b>${esc(p.full_name)}</b>
          <div class="tiny">
            @${esc(p.username)} •
            ${esc(classNames[p.class_key] || "كل الفصول")}
          </div>
        </div>
        <span class="pill">${esc(roles[p.role])}</span>
      </div>
    `)).join("")}

    ${people?.length
      ? ""
      : card('<div class="empty">مفيش حسابات لسه</div>')}

    ${card(`
      <h3>إضافة حساب جديد</h3>

      <form id="newAccount">

        <label>اسم الطالب / المسؤول
          <input
            name="full_name"
            required
            maxlength="100"
          >
        </label>

        <label>اسم المستخدم (بالإنجليزي)
          <input
            name="username"
            required
            pattern="[a-z0-9_.-]{3,32}"
            placeholder="oliver01"
          >
        </label>

        <label>كلمة السر
          <span class="password-wrap">
            <input
              id="newPassword"
              name="password"
              type="password"
              required
              minlength="8"
            >
            <button
              type="button"
              class="eye-toggle"
              data-toggle-password="newPassword"
              aria-label="إظهار كلمة السر"
            >◉</button>
          </span>
        </label>

        ${me.role === "main" ? `
          <label>نوع الحساب
            <select name="role" id="newRole">
              <option value="student">طالب</option>
              <option value="owner">مسؤول الفصل</option>
            </select>
          </label>

          <label>الفصل
            <select name="class_key" id="newClass" required>
              ${classOptions}
            </select>
          </label>
        ` : ""}

        <button class="primary full">
          إنشاء الحساب ←
        </button>

      </form>

      <p class="tiny">
        كلمة السر لازم تكون ٨ حروف على الأقل.
      </p>
    `)}
  `;

  $("#newAccount").onsubmit = async (e) => {
    e.preventDefault();

    const f = e.currentTarget;
    const btn = f.querySelector("button.primary");
    btn.disabled = true;

    const role = me.role === "main"
      ? f.elements.role.value
      : "student";

    // Never allow creating another Main Admin here.
    if (!["student", "owner"].includes(role)) {
      toast("نوع الحساب غير مسموح");
      btn.disabled = false;
      return;
    }

    const class_key = me.role === "main"
      ? $("#newClass").value
      : me.class_key;

    try {
      const { data, error } = await db.functions.invoke(
        "create-user",
        {
          body: {
            username: f.elements.username.value.trim().toLowerCase(),
            password: f.elements.password.value,
            full_name: f.elements.full_name.value.trim(),
            role,
            class_key
          }
        }
      );

      if (error) throw error;
      if (data?.error) throw Error(data.error);

      toast("الحساب اتعمل بنجاح");
      await render();

    } catch (err) {
      toast("مقدرناش ننشئ الحساب: " + err.message);
      btn.disabled = false;
    }
  };
}
