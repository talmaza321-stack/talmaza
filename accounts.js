
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

  // LOAD ACCOUNTS
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

  const accountCards = (people || [])
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

  // RENDER PAGE
  v.innerHTML = `
    <h2>
      ${me.role === "main"
        ? "إدارة الحسابات"
        : "طلبة الفصل"}
    </h2>

    <p class="muted">
      الحسابات بتتعمل باسم مستخدم وكلمة سر، من غير إيميل.
    </p>

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

        ${me.role === "main" ? `
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

  // ACCOUNT CREATION
  const form = $("#newAccount");

  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();

    const btn = form.querySelector(
      'button[type="submit"]'
    );

    const username = form.elements.username
      .value.trim().toLowerCase();

    const password = form.elements.password.value;

    const full_name = form.elements.full_name
      .value.trim();

    const role = me.role === "main"
      ? form.elements.role.value
      : "student";

    const class_key = me.role === "main"
      ? form.elements.class_key.value
      : me.class_key;

    // VALIDATE INPUT
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
      toast("كلمة السر لازم تكون ٨ حروف على الأقل");
      return;
    }

    if (!["student", "owner"].includes(role)) {
      toast("نوع الحساب غير مسموح");
      return;
    }

    if (
      me.role !== "main" &&
      role !== "student"
    ) {
      toast("مسؤول الفصل يقدر يضيف طلبة بس");
      return;
    }

    if (!["first", "second", "third"].includes(class_key)) {
      toast("اختار فصل صحيح");
      return;
    }

    btn.disabled = true;
    btn.textContent = "جاري إنشاء الحساب...";

    try {
      const { data, error } =
        await db.functions.invoke("create-user", {
          body: {
            username,
            password,
            full_name,
            role,
            class_key
          }
        });

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
            // Keep the original error message
          }
        }

        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast("الحساب اتعمل بنجاح");

      // Refresh account list
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
      btn.textContent = "إنشاء الحساب ←";
    }
  };
}
