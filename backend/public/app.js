let csrf = null;
let me = null;
let selectedClassId = null;

const $ = id =>
  document.getElementById(id);

function toast(message) {
  const box = $("toast");

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer =
    setTimeout(() => {
      box.classList.remove("show");
    }, 2500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      char =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]
    );
}

async function api(
  url,
  options = {}
) {
  const headers =
    new Headers(
      options.headers || {}
    );

  if (
    options.body &&
    !headers.has("content-type")
  ) {
    headers.set(
      "content-type",
      "application/json"
    );
  }

  const method =
    String(
      options.method || "GET"
    ).toUpperCase();

  if (
    [
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ].includes(method) &&
    csrf
  ) {
    headers.set(
      "x-csrf-token",
      csrf
    );
  }

  const response =
    await fetch(
      url,
      {
        ...options,
        headers,
        credentials: "same-origin"
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {}

  if (!response.ok) {
    const error =
      new Error(
        data.error ||
        "REQUEST_FAILED"
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}

async function refreshCsrf() {
  const data =
    await api(
      "/api/auth/csrf"
    );

  csrf =
    data.csrf;
}

async function boot() {
  try {
    me =
      await api(
        "/api/auth/me"
      );

    await refreshCsrf();

    openApp();

  } catch {
    showLogin();
  }
}

function showLogin() {
  $("loginView")
    ?.classList
    .remove("hidden");

  $("appView")
    ?.classList
    .add("hidden");
}

function openApp() {
  $("loginView")
    ?.classList
    .add("hidden");

  $("appView")
    ?.classList
    .remove("hidden");

  if ($("hello")) {
    $("hello").textContent =
      `مرحباً ${me.fullName}`;
  }

  if ($("roleBadge")) {
    $("roleBadge").textContent =
      me.role === "DIRECTOR"
        ? "مدير"
        : me.role === "TEACHER"
        ? "معلم"
        : "ولي أمر";
  }
const directorPanel =
  $("directorUserPanel");

if (directorPanel) {
  directorPanel.classList.toggle(
    "hidden",
    me.role !== "DIRECTOR"
  );
      }
  loadClasses();
  loadInvites();
}

async function login() {
  const loginValue =
    $("login")
      ?.value
      .trim();

  const passwordValue =
    $("password")
      ?.value || "";

  if (
    !loginValue ||
    !passwordValue
  ) {
    toast(
      "أدخل اسم المستخدم وكلمة المرور"
    );

    return;
  }

  try {
    const data =
      await api(
        "/api/auth/login",
        {
          method: "POST",
          body:
            JSON.stringify({
              login:
                loginValue,
              password:
                passwordValue
            })
        }
      );

    csrf =
      data.csrf;

    me =
      data.user;

    openApp();

    toast(
      "تم تسجيل الدخول"
    );

  } catch {
    toast(
      "بيانات الدخول غير صحيحة"
    );
  }
}

async function logout() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } catch {}

  csrf = null;
  me = null;

  location.reload();
}

async function loadClasses() {
  try {
    const data =
      await api(
        "/api/classes"
      );

    const select =
      $("classSelect");

    if (!select) return;

    if (
      !data.classes?.length
    ) {
      select.innerHTML =
        `
        <option value="">
          لا توجد أقسام
        </option>
        `;

      selectedClassId =
        null;

      clearClassData();

      return;
    }

    select.innerHTML =
      data.classes
        .map(
          item =>
            `
            <option value="${item.id}">
              ${escapeHtml(
                item.name
              )}
            </option>
            `
        )
        .join("");

    selectedClassId =
      data.classes[0].id;

    await loadClass();

  } catch {
    toast(
      "تعذر تحميل الأقسام"
    );
  }
}

function clearClassData() {
  if ($("students")) {
    $("students").innerHTML =
      "";
  }

  if ($("subjects")) {
    $("subjects").innerHTML =
      "";
  }

  if ($("studentCount")) {
    $("studentCount")
      .textContent =
      "0";
  }
}

async function loadClass() {
  const select =
    $("classSelect");

  if (!select) return;

  selectedClassId =
    select.value;

  if (!selectedClassId) {
    clearClassData();
    return;
  }

  try {
    const [
      studentsData,
      subjectsData
    ] =
      await Promise.all([
        api(
          `/api/classes/${
            encodeURIComponent(
              selectedClassId
            )
          }/students`
        ),

        api(
          `/api/classes/${
            encodeURIComponent(
              selectedClassId
            )
          }/subjects`
        )
      ]);

    renderStudents(
      studentsData.students || []
    );

    renderSubjects(
      subjectsData.subjects || [],
      subjectsData.role
    );

    if ($("classInfo")) {
      $("classInfo")
        .textContent =
        `${
          studentsData
            .students
            .length
        } تلميذ · ${
          subjectsData
            .subjects
            .length
        } مادة`;
    }

  } catch {
    toast(
      "تعذر فتح بيانات القسم"
    );
  }
}

function renderStudents(
  students
) {
  if ($("studentCount")) {
    $("studentCount")
      .textContent =
      String(
        students.length
      );
  }

  const box =
    $("students");

  if (!box) return;

  if (!students.length) {
    box.innerHTML =
      `
      <div class="hint">
        لا يوجد تلاميذ بعد
      </div>
      `;

    return;
  }

  box.innerHTML =
    students
      .map(
        student =>
          `
          <div class="student">

            <b>
              ${escapeHtml(
                student.full_name
              )}
            </b>

            <span>
              ${escapeHtml(
                student.student_uid
              )}
              ·
              ${escapeHtml(
                student.status
              )}
            </span>

          </div>
          `
      )
      .join("");
}

function renderSubjects(
  subjects,
  role
) {
  const box =
    $("subjects");

  if (!box) return;

  if (!subjects.length) {
    box.innerHTML =
      `
      <div class="hint">
        لا توجد مواد بعد
      </div>
      `;

    return;
  }

  box.innerHTML =
    subjects
      .map(
        subject => {
          const writable =
            role ===
              "DIRECTOR" ||
            subject
              .assigned_to_me;

          return `
            <div
              class="subject ${
                writable
                  ? "can-write"
                  : ""
              }"
            >

              <b>
                ${escapeHtml(
                  subject.name
                )}
              </b>

              <span>
                المعامل
                ${escapeHtml(
                  String(
                    subject
                      .coefficient
                  )
                )}
              </span>

              <span
                class="${
                  writable
                    ? "write"
                    : "readonly"
                }"
              >
                ${
                  writable
                    ? "يمكنك التعديل"
                    : "قراءة فقط"
                }
              </span>

            </div>
          `;
        }
      )
      .join("");
}

async function sendInvites() {
  if (!selectedClassId) {
    toast(
      "اختر القسم أولاً"
    );

    return;
  }

  const raw =
    $("inviteLogins")
      ?.value || "";

  const logins =
    raw
      .split(
        /[,،\n]/
      )
      .map(
        item =>
          item.trim()
      )
      .filter(Boolean);

  if (!logins.length) {
    toast(
      "أدخل حساب معلم واحد على الأقل"
    );

    return;
  }

  try {
    const data =
      await api(
        `/api/classes/${
          encodeURIComponent(
            selectedClassId
          )
        }/invites`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              logins
            })
        }
      );

    if ($("inviteLogins")) {
      $("inviteLogins")
        .value =
        "";
    }

    toast(
      `تم إرسال ${
        data.invited.length
      } دعوة`
    );

  } catch {
    toast(
      "تعذر إرسال الدعوات"
    );
  }
}

async function loadInvites() {
  try {
    const data =
      await api(
        "/api/invites"
      );

    const box =
      $("invitesBox");

    if (!box) return;

    if (
      !data.invites?.length
    ) {
      box.innerHTML =
        "";

      return;
    }

    box.innerHTML =
      data.invites
        .map(
          invite =>
            `
            <div class="invite">

              <div>

                <b>
                  ${escapeHtml(
                    invite
                      .class_name
                  )}
                </b>

                <span>
                  من
                  ${escapeHtml(
                    invite
                      .inviter_name
                  )}
                </span>

              </div>

              <button
                type="button"
                data-accept="${
                  invite.id
                }"
              >
                قبول
              </button>

            </div>
            `
        )
        .join("");

    document
      .querySelectorAll(
        "[data-accept]"
      )
      .forEach(
        button => {

          button.onclick =
            () =>
              acceptInvite(
                button.dataset
                  .accept
              );

        }
      );

  } catch {}
}

async function acceptInvite(
  inviteId
) {
  try {
    await api(
      `/api/invites/${
        encodeURIComponent(
          inviteId
        )
      }/accept`,
      {
        method:
          "POST"
      }
    );

    toast(
      "تم الانضمام للقسم"
    );

    await loadInvites();
    await loadClasses();

  } catch {
    toast(
      "تعذر قبول الدعوة"
    );
  }
}
async function createUser() {
  if (me?.role !== "DIRECTOR") {
    toast("هذه العملية للمدير فقط");
    return;
  }

  const fullName =
    $("newUserFullName")?.value.trim();

  const login =
    $("newUserLogin")?.value.trim();

  const email =
    $("newUserEmail")?.value.trim();

  const password =
    $("newUserPassword")?.value || "";

  const role =
    $("newUserRole")?.value;

  if (
    !fullName ||
    !login ||
    !password
  ) {
    toast(
      "أكمل الاسم واسم المستخدم وكلمة المرور"
    );
    return;
  }

  if (password.length < 12) {
    toast(
      "كلمة المرور يجب أن تكون 12 حرفاً على الأقل"
    );
    return;
  }

  try {
    const data =
      await api(
        "/api/director/users",
        {
          method: "POST",
          body: JSON.stringify({
            fullName,
            login,
            email:
              email || null,
            password,
            role
          })
        }
      );

    $("newUserFullName").value = "";
    $("newUserLogin").value = "";
    $("newUserEmail").value = "";
    $("newUserPassword").value = "";

    if ($("createUserResult")) {
      $("createUserResult").textContent =
        `تم إنشاء الحساب: ${data.user.login}`;
    }

    toast("تم إنشاء الحساب بنجاح");

  } catch (error) {

    if (
      error.data?.error ===
      "LOGIN_OR_EMAIL_EXISTS"
    ) {
      toast(
        "اسم المستخدم أو البريد مستخدم مسبقاً"
      );
      return;
    }

    toast("تعذر إنشاء الحساب");
  }
          }
$("loginBtn") &&
  (
    $("loginBtn").onclick =
      login
  );

$("logoutBtn") &&
  (
    $("logoutBtn").onclick =
      logout
  );

$("inviteBtn") &&
  (
    $("inviteBtn").onclick =
      sendInvites
  );

$("classSelect") &&
  (
    $("classSelect")
      .onchange =
      loadClass
  );

$("password") &&
  $("password")
    .addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter"
        ) {
          login();
        }
      }
    );
$("createUserBtn") &&
  (
    $("createUserBtn").onclick =
      createUser
  );
boot();
