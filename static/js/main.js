// static/js/main.js — Mr. Civil Complete Frontend Logic
// ============================================================

// ---- Utilities ----

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)       return "just now";
  if (diff < 3600)     return Math.floor(diff / 60) + "m ago";
  if (diff < 86400)    return Math.floor(diff / 3600) + "h ago";
  if (diff < 2592000)  return Math.floor(diff / 86400) + "d ago";
  return new Date(dateStr).toLocaleDateString("en-IN");
}

function digitsOnly(s) { return (s || "").replace(/\D/g, ""); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).toLowerCase()); }

function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = msg;
    el.style.display = "";
    setTimeout(() => { el.textContent = ""; }, 8000);
  }
  showToast(msg, "danger");
}

function mapStatusClass(status) {
  const s = (status || "").toLowerCase().replace(/\s+/g, "");
  return {
    open: "status-open",
    verified: "status-verified",
    assigned: "status-assigned",
    inprogress: "status-inprogress",
    resolved: "status-resolved",
    closed: "status-closed",
    rejected: "status-rejected",
  }[s] || "status-open";
}

function starsHtml(avg, max = 5) {
  if (avg === null || avg === undefined) return "";
  const rounded = Math.round(avg);
  let html = '<div class="stars-display">';
  for (let i = 1; i <= max; i++) {
    html += `<span class="${i <= rounded ? "star-filled" : "star-empty"}">★</span>`;
  }
  html += `</div> <span style="font-size:0.8rem;color:var(--text-muted);">(${avg}/5)</span>`;
  return html;
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

// ---- Toast ----

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) { console.warn("No toast container:", message); return; }
  const icons = { success: "✅", danger: "❌", info: "ℹ️" };
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.innerHTML = `
    <span class="toast-icon">${icons[type] || "ℹ️"}</span>
    <span>${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
  setTimeout(() => { div.style.opacity = "0"; div.style.transform = "translateX(100%)"; setTimeout(() => div.remove(), 300); }, 4500);
}

// ---- Modal ----

function openModal(title, bodyHtml) {
  const backdrop = document.getElementById("modal-backdrop");
  const box      = document.getElementById("modal-box");
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  backdrop.classList.remove("hidden");
  setTimeout(() => backdrop.classList.add("show"), 10);
}

function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  backdrop.classList.remove("show");
  setTimeout(() => backdrop.classList.add("hidden"), 200);
}

// ---- DOMContentLoaded ----

document.addEventListener("DOMContentLoaded", () => {

  // Modal close
  const closeBtns = document.querySelectorAll("#modal-close-btn");
  closeBtns.forEach(b => b.addEventListener("click", closeModal));
  document.getElementById("modal-backdrop")?.addEventListener("click", e => {
    if (e.target.id === "modal-backdrop") closeModal();
  });

  // Forms
  const regForm      = document.getElementById("registration-form");
  const loginForm    = document.getElementById("login-form");
  const complaintForm = document.getElementById("complaint-form");
  const updateForm   = document.getElementById("update-form");
  const verifyForm   = document.getElementById("verify-form");
  const createUserForm = document.getElementById("create-user-form");
  const progressForm = document.getElementById("progress-form");

  if (regForm)       regForm.addEventListener("submit", handleRegistration);
  if (loginForm)     loginForm.addEventListener("submit", handleLogin);
  if (complaintForm) complaintForm.addEventListener("submit", handleComplaintSubmission);
  if (updateForm)    updateForm.addEventListener("submit", handleComplaintUpdate);
  if (verifyForm)    verifyForm.addEventListener("submit", handleVerificationSubmit);
  if (createUserForm) createUserForm.addEventListener("submit", handleCreateUser);
  if (progressForm)  progressForm.addEventListener("submit", handleStaffProgress);

  // Drag-drop upload zones
  setupDropZone("complaint-drop-zone", "complaint_images", "complaint-preview-row");
  setupDropZone("work-drop-zone", "work_images", "work-preview-row");
  setupDropZone("progress-drop-zone", "work_images", "progress-preview-row");

  // Page-specific loads
  const path = window.location.pathname;
  if (path.includes("/user"))     { loadComplaints(); initNotifications(); }
  if (path.includes("/admin"))    { loadComplaints(); loadStaffIntoAdminDropdown(); initNotifications(); }
  if (path.includes("/verifier")) { loadVerifierComplaints(); initNotifications(); }
  if (path.includes("/staff"))    { loadStaffComplaints(); initNotifications(); }

  // Notification bell setup
  const bellBtn = document.getElementById("notif-bell-btn");
  const panel   = document.getElementById("notif-panel");
  if (bellBtn && panel) {
    bellBtn.addEventListener("click", e => {
      e.stopPropagation();
      const isHidden = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !isHidden);
      if (isHidden) loadNotifications();
    });
    document.addEventListener("click", e => {
      if (!document.getElementById("notif-bell-wrap")?.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });
    document.getElementById("notif-mark-all-btn")?.addEventListener("click", markAllRead);
  }
});

// ============================================================
// AUTH
// ============================================================

async function handleRegistration(e) {
  e.preventDefault();
  const form      = e.target;
  const first     = (document.getElementById("first_name")?.value || "").trim();
  const last      = (document.getElementById("last_name")?.value || "").trim();
  const aadhar    = digitsOnly(document.getElementById("aadhar_card")?.value);
  const email     = (document.getElementById("email")?.value || "").trim().toLowerCase();
  const phone     = digitsOnly(document.getElementById("phone_number")?.value);
  const password  = document.getElementById("password")?.value || "";
  const confirm   = document.getElementById("password_confirm")?.value || "";

  if (!first)                         return showError("register-error", "First name is required");
  if (!/^\d{12}$/.test(aadhar))       return showError("register-error", "Aadhaar must be 12 digits");
  if (!/^\d{10}$/.test(phone))        return showError("register-error", "Phone must be 10 digits");
  if (!isValidEmail(email))           return showError("register-error", "Enter a valid email");
  if (password.length < 6)            return showError("register-error", "Password must be at least 6 characters");
  if (password !== confirm)           return showError("register-error", "Passwords do not match");

  const btn = document.getElementById("reg-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

  try {
    const resp = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ first_name: first, last_name: last, aadhar_card: aadhar, email, phone_number: phone, password }),
    });
    const data = await resp.json();
    if (data.success) {
      showToast("Account created! Please log in.", "success");
      setTimeout(() => window.location.href = "/", 1200);
    } else {
      showError("register-error", data.message || "Registration failed");
      if (btn) { btn.disabled = false; btn.textContent = "🎉 Create Account"; }
    }
  } catch (err) {
    showError("register-error", "Network error. Please try again.");
    if (btn) { btn.disabled = false; btn.textContent = "🎉 Create Account"; }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email      = (document.getElementById("login_email")?.value || "").trim().toLowerCase();
  const password   = document.getElementById("login_password")?.value || "";
  const login_type = document.querySelector('input[name="login_role"]:checked')?.value || "user";

  if (!isValidEmail(email)) return showError("login-error", "Enter a valid email");
  if (!password)            return showError("login-error", "Password is required");

  const btn = document.getElementById("login-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }

  try {
    const resp = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, login_type }),
    });
    const data = await resp.json();
    if (data.success) {
      showToast("Welcome back!", "success");
      const routes = { admin: "/admin", staff: "/staff", verifier: "/verifier" };
      window.location.href = routes[data.user_type] || "/user";
    } else {
      showError("login-error", data.message || "Login failed");
      if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
    }
  } catch (err) {
    showError("login-error", "Network error. Please try again.");
    if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
  }
}

async function logout() {
  try { await fetch("/logout"); } finally { window.location.href = "/"; }
}

// ============================================================
// COMPLAINT SUBMISSION
// ============================================================

async function handleComplaintSubmission(e) {
  e.preventDefault();
  const title       = (document.getElementById("title")?.value || "").trim();
  const description = (document.getElementById("description")?.value || "").trim();
  const city        = (document.getElementById("city")?.value || "").trim();
  const pincode     = digitsOnly(document.getElementById("pincode")?.value);
  const landmark    = (document.getElementById("landmark")?.value || "").trim();
  const filesInput  = document.getElementById("complaint_images");

  if (!title)                          return showError("complaint-error", "Title is required");
  if (description.length < 10)         return showError("complaint-error", "Description must be at least 10 characters");
  if (!city)                           return showError("complaint-error", "City is required");
  if (!/^\d{6}$/.test(pincode))        return showError("complaint-error", "Pincode must be 6 digits");

  const btn = document.getElementById("complaint-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", description);
  fd.append("city", city);
  fd.append("pincode", pincode);
  fd.append("landmark", landmark);
  if (filesInput?.files?.length) {
    for (let i = 0; i < filesInput.files.length; i++) fd.append("complaint_images", filesInput.files[i]);
  }

  try {
    const resp = await fetch("/submit_complaint", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) {
      showToast("Complaint submitted successfully!", "success");
      e.target.reset();
      document.getElementById("complaint-preview-row").innerHTML = "";
      switchTab?.("list");
      loadComplaints();
    } else {
      showError("complaint-error", data.message || "Submission failed");
    }
  } catch (err) {
    showError("complaint-error", "Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📨 Submit Complaint"; }
  }
}

// ============================================================
// LOAD COMPLAINTS
// ============================================================

let allComplaintsData = [];

async function loadComplaints() {
  const container = document.getElementById("complaints-container");
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton" style="height:100px;margin-bottom:0.875rem;"></div>
    <div class="skeleton" style="height:100px;margin-bottom:0.875rem;"></div>
    <div class="skeleton" style="height:100px;"></div>
  `;
  try {
    const resp = await fetch("/get_complaints");
    const data = await resp.json();
    if (!data.success) { container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${escapeHtml(data.message)}</p></div>`; return; }
    allComplaintsData = data.data || [];
    renderComplaints(allComplaintsData);
    updateUserStats(allComplaintsData);
    updateAdminStats(allComplaintsData);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h4>Failed to load</h4><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function filterAdminComplaints() {
  const query  = (document.getElementById("admin-search")?.value || "").toLowerCase();
  const status = document.getElementById("admin-filter-status")?.value || "";
  const filtered = allComplaintsData.filter(c => {
    const matchQ = !query || c.title?.toLowerCase().includes(query) || c.city?.toLowerCase().includes(query) || c.description?.toLowerCase().includes(query);
    const matchS = !status || c.status === status;
    return matchQ && matchS;
  });
  renderComplaints(filtered);
}

function updateUserStats(complaints) {
  if (!document.getElementById("stat-total")) return;
  document.getElementById("stat-total").textContent    = complaints.length;
  document.getElementById("stat-open").textContent     = complaints.filter(c => !["Closed","Resolved","Rejected"].includes(c.status)).length;
  document.getElementById("stat-closed").textContent   = complaints.filter(c => ["Closed","Resolved"].includes(c.status)).length;
  document.getElementById("stat-rejected").textContent = complaints.filter(c => c.status === "Rejected").length;
}

function updateAdminStats(complaints) {
  if (!document.getElementById("admin-stat-total")) return;
  document.getElementById("admin-stat-total").textContent    = complaints.length;
  document.getElementById("admin-stat-open").textContent     = complaints.filter(c => ["Open","Verified"].includes(c.status)).length;
  document.getElementById("admin-stat-progress").textContent = complaints.filter(c => ["Assigned","In Progress"].includes(c.status)).length;
  document.getElementById("admin-stat-closed").textContent   = complaints.filter(c => ["Closed","Resolved"].includes(c.status)).length;
}

function renderComplaints(complaints) {
  const container = document.getElementById("complaints-container");
  if (!container) return;
  const isAdmin = window.location.pathname.includes("/admin");

  if (!complaints || complaints.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h4>No complaints found</h4><p>${isAdmin ? "All caught up! No complaints match your filter." : "You haven't filed any complaints yet."}</p></div>`;
    return;
  }

  container.innerHTML = "";
  complaints.forEach(c => {
    const div = document.createElement("div");
    div.className = "complaint-card";
    div.dataset.id = c.id;

    const statusClass = mapStatusClass(c.status);
    const age         = daysSince(c.created_at);
    const canEscalate = !["Closed","Resolved","Rejected"].includes(c.status) && age >= 3;

    // Complaint images
    const imgHtml = (c.complaint_images || []).length > 0
      ? `<div class="thumb-row">${(c.complaint_images||[]).map(u => `<img src="${u}" class="complaint-thumb" alt="complaint image" onclick="viewImage('${u}')" />`).join("")}</div>`
      : "";

    // Work images
    const workHtml = (c.work_images || []).length > 0
      ? `<div style="margin-top:0.75rem;"><div class="section-title">Work Progress</div><div class="thumb-row">${(c.work_images||[]).map(u => `<img src="${u}" class="work-thumb" alt="work image" onclick="viewImage('${u}')" />`).join("")}</div></div>`
      : "";

    // Assignee
    const assigneeHtml = c.assignee
      ? `<span class="assignee-badge">🔧 [${escapeHtml(c.assignee.short_id||"")}] ${escapeHtml(c.assignee.first_name||"")} ${escapeHtml(c.assignee.last_name||"")}</span>`
      : "";

    // User info (admin only)
    const userInfoHtml = isAdmin && c.creator
      ? `<div class="user-info-box">👤 <strong>${escapeHtml(c.creator.first_name||"")} ${escapeHtml(c.creator.last_name||"")}</strong> · ${escapeHtml(c.creator.email||"")} · ${escapeHtml(c.creator.phone_number||"")}</div>`
      : "";

    div.innerHTML = `
      <div class="complaint-card-header">
        <h3 class="complaint-card-title">${escapeHtml(c.title || "Untitled")}</h3>
        <span class="status-pill ${statusClass}">${escapeHtml(c.status || "Open")}</span>
      </div>
      <div class="complaint-card-meta">
        <span>📍 ${escapeHtml(c.city||"")}${c.pincode ? ` — ${escapeHtml(c.pincode)}` : ""}</span>
        ${c.landmark ? `<span>🏛 ${escapeHtml(c.landmark)}</span>` : ""}
        <span>🕐 ${timeAgo(c.created_at)}</span>
        ${age >= 3 ? `<span style="color:#dc2626;">⚠ ${age}d old</span>` : ""}
      </div>
      <p class="complaint-card-desc">${escapeHtml(c.description||"")}</p>
      ${imgHtml}
      ${workHtml}
      ${userInfoHtml}
      <div class="complaint-card-footer">
        ${assigneeHtml}
        ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="adminEditComplaint('${c.id}','${escapeHtml(c.title||"").replace(/'/g,"\\'")}')">✏️ Edit / Assign</button>` : ""}
        ${canEscalate && !isAdmin ? `<button class="escalate-btn" onclick="openEscalationModal('${c.id}')">🚨 Escalate</button>` : ""}
        ${["Closed","Resolved"].includes(c.status) && !isAdmin ? `<button class="btn btn-outline btn-sm" onclick="showRatingModal('${c.id}','${escapeHtml(c.title||"").replace(/'/g,"\\'")}')">⭐ Rate Staff</button>` : ""}
        ${["Closed","Resolved"].includes(c.status) && !isAdmin ? `<button class="btn btn-outline btn-sm" onclick="showFeedbackModal('${c.id}')">💬 Feedback</button>` : ""}
      </div>
    `;
    container.appendChild(div);
  });
}

function adminEditComplaint(id, title) {
  document.getElementById("update-complaint-id").value = id;
  document.getElementById("update-complaint-id-hidden").value = id;
  adminTab("assign");
  showToast(`Editing: ${title}`, "info");
}

function viewImage(url) {
  openModal("Image Preview", `<img src="${url}" style="width:100%;border-radius:var(--radius-sm);" alt="Preview" />`);
}

// ============================================================
// ADMIN: UPDATE COMPLAINT
// ============================================================

async function handleComplaintUpdate(e) {
  e.preventDefault();
  const form        = e.target;
  const complaint_id = (document.getElementById("update-complaint-id-hidden")?.value || "").trim();
  const status      = form.querySelector("[name='status']")?.value || "";
  const assigned_to = form.querySelector("[name='assigned_to']")?.value || "";
  const filesInput  = document.getElementById("work_images");

  if (!complaint_id) return showError("update-error", "Please select a complaint first (click Edit on a complaint)");

  const btn = document.getElementById("update-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }

  const fd = new FormData();
  fd.append("complaint_id", complaint_id);
  if (status)      fd.append("status", status);
  if (assigned_to) fd.append("assigned_to", assigned_to);
  if (filesInput?.files?.length) {
    for (let i = 0; i < filesInput.files.length; i++) fd.append("work_images", filesInput.files[i]);
  }

  try {
    const resp = await fetch("/update_complaint", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) {
      showToast("Complaint updated successfully!", "success");
      clearUpdateForm();
      loadComplaints();
    } else {
      showError("update-error", data.message || "Update failed");
    }
  } catch (err) {
    showError("update-error", "Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✔ Update Complaint"; }
  }
}

// ============================================================
// ADMIN: CREATE USER
// ============================================================

async function handleCreateUser(e) {
  e.preventDefault();
  const first_name = (document.getElementById("new-first-name")?.value || "").trim();
  const last_name  = (document.getElementById("new-last-name")?.value || "").trim();
  const email      = (document.getElementById("new-email")?.value || "").trim().toLowerCase();
  const password   = document.getElementById("new-password")?.value || "";
  const user_role  = document.getElementById("new-user-role")?.value || "staff";

  if (!first_name || !email || !password) return showError("create-user-error", "Name, email, and password are required");
  if (!isValidEmail(email))               return showError("create-user-error", "Enter a valid email");
  if (password.length < 6)               return showError("create-user-error", "Password must be at least 6 characters");

  const btn = document.getElementById("create-user-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

  try {
    const resp = await fetch("/admin/create_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name, last_name, email, password, user_role }),
    });
    const data = await resp.json();
    if (data.success) {
      showToast(`${user_role === "staff" ? "Staff" : "Verifier"} created! Short ID: ${data.short_id || "—"}`, "success");
      e.target.reset();
      loadStaffIntoAdminDropdown();
      loadTeamList();
    } else {
      showError("create-user-error", data.message || "Failed to create user");
    }
  } catch (err) {
    showError("create-user-error", "Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Create Account"; }
  }
}

// ============================================================
// ADMIN: STAFF DROPDOWN & TEAM LIST
// ============================================================

async function loadStaffIntoAdminDropdown() {
  try {
    const resp = await fetch("/api/get_staff");
    const data = await resp.json();
    const sel  = document.getElementById("assigned_to");
    if (!sel) return;
    sel.innerHTML = '<option value="">— No change / Select staff —</option>';
    (data.data || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `[${s.short_id || "—"}] ${s.first_name || ""} ${s.last_name || ""}`;
      sel.appendChild(opt);
    });
  } catch (err) { console.error("Failed to load staff:", err); }
}

async function loadTeamList() {
  const container = document.getElementById("team-list-container");
  if (!container) return;
  try {
    const [sResp, vResp] = await Promise.all([fetch("/api/get_staff"), fetch("/api/get_verifiers")]);
    const sData = await sResp.json();
    const vData = await vResp.json();
    const all   = [
      ...(sData.data || []).map(u => ({ ...u, display_role: "Staff" })),
      ...(vData.data || []).map(u => ({ ...u, display_role: "Verifier" })),
    ];
    if (all.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h4>No team members yet</h4><p>Add staff or verifiers using the form above.</p></div>`;
      return;
    }
    container.innerHTML = all.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:700;font-size:0.9rem;">${escapeHtml(u.first_name||"")} ${escapeHtml(u.last_name||"")}</div>
          <div style="font-size:0.775rem;color:var(--text-muted);">${escapeHtml(u.email||"")} &middot; ID: ${escapeHtml(u.short_id||"—")}</div>
        </div>
        <span class="role-badge" style="background:${u.display_role==="Staff"?"rgba(22,163,74,0.1)":"rgba(26,39,68,0.1)"};color:${u.display_role==="Staff"?"#15803d":"var(--navy)"};">
          ${u.display_role === "Staff" ? "🔧" : "🔍"} ${u.display_role}
        </span>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load team: ${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadStaffRatings() {
  const container = document.getElementById("ratings-container");
  if (!container) return;
  try {
    const resp = await fetch("/api/get_staff");
    const data = await resp.json();
    const staff = data.data || [];
    if (staff.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⭐</div><h4>No staff yet</h4></div>`;
      return;
    }
    const ratings = await Promise.all(staff.map(async s => {
      try {
        const r = await fetch(`/api/staff_rating/${s.id}`);
        const d = await r.json();
        return { ...s, avg: d.average, count: d.count };
      } catch { return { ...s, avg: null, count: 0 }; }
    }));
    ratings.sort((a, b) => (b.avg || 0) - (a.avg || 0));
    container.innerHTML = ratings.map((s, i) => `
      <div style="display:flex;align-items:center;gap:1rem;padding:0.875rem 0;border-bottom:1px solid var(--border);">
        <div style="width:28px;height:28px;border-radius:50%;background:${i < 3 ? "var(--saffron)" : "var(--border)"};color:${i < 3 ? "var(--navy)" : "var(--text-muted)"};display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;flex-shrink:0;">
          ${i + 1}
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;">${escapeHtml(s.first_name||"")} ${escapeHtml(s.last_name||"")} <span style="font-size:0.75rem;color:var(--text-muted);">[${escapeHtml(s.short_id||"—")}]</span></div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${s.count} review${s.count !== 1 ? "s" : ""}</div>
        </div>
        <div>${s.avg !== null ? starsHtml(s.avg) : '<span style="color:var(--text-muted);font-size:0.8rem;">No ratings</span>'}</div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load ratings.</p></div>`;
  }
}

// ============================================================
// VERIFIER
// ============================================================

async function loadVerifierComplaints() {
  const container = document.getElementById("complaints-container");
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton" style="height:120px;margin-bottom:0.875rem;"></div>
    <div class="skeleton" style="height:120px;margin-bottom:0.875rem;"></div>
  `;
  try {
    const resp = await fetch("/verifier_complaints");
    const data = await resp.json();
    const complaints = data.data || [];
    if (document.getElementById("verif-stat-pending")) {
      document.getElementById("verif-stat-pending").textContent = complaints.length;
    }
    if (complaints.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><h4>All caught up!</h4><p>No Open complaints to review right now.</p></div>`;
      return;
    }
    container.innerHTML = "";
    complaints.forEach(c => {
      const div  = document.createElement("div");
      div.className = "complaint-card";
      const imgHtml = (c.complaint_images || []).map(u => `<img src="${u}" class="complaint-thumb" onclick="viewImage('${u}')" alt="complaint image" />`).join("");
      div.innerHTML = `
        <div class="complaint-card-header">
          <h3 class="complaint-card-title">${escapeHtml(c.title || "Untitled")}</h3>
          <span class="status-pill ${mapStatusClass(c.status)}">${escapeHtml(c.status)}</span>
        </div>
        <div class="complaint-card-meta">
          <span>📍 ${escapeHtml(c.city||"")}${c.pincode ? ` — ${escapeHtml(c.pincode)}` : ""}</span>
          <span>🕐 ${timeAgo(c.created_at)}</span>
          ${c.creator ? `<span>👤 ${escapeHtml(c.creator.first_name||"")} ${escapeHtml(c.creator.last_name||"")}</span>` : ""}
        </div>
        <p class="complaint-card-desc">${escapeHtml(c.description||"")}</p>
        ${imgHtml ? `<div class="thumb-row">${imgHtml}</div>` : ""}
        <div class="complaint-card-footer">
          <button class="btn btn-primary btn-sm" onclick="selectVerifyComplaint('${c.id}','${escapeHtml(c.title||"").replace(/'/g,"\\'")}')">
            🔍 Review This Complaint
          </button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function selectVerifyComplaint(id, title) {
  document.getElementById("verify-complaint-id").value = id;
  document.getElementById("verify-selected-title").textContent = title;
  const panel = document.getElementById("verify-panel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function handleVerificationSubmit(e) {
  e.preventDefault();
  const complaint_id        = document.getElementById("verify-complaint-id")?.value || "";
  const verification_status = document.getElementById("verification_status")?.value || "";
  const verification_notes  = document.getElementById("verification_notes")?.value || "";

  if (!complaint_id)         return showError("verify-error", "No complaint selected");
  if (!verification_status)  return showError("verify-error", "Select an action");

  const btn = document.getElementById("verify-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }

  try {
    const resp = await fetch("/verify_complaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaint_id, verification_status, verification_notes }),
    });
    const data = await resp.json();
    if (data.success) {
      showToast(`Complaint ${verification_status === "Verified" ? "verified ✅" : "rejected ❌"}`, "success");
      document.getElementById("verify-form")?.reset();
      document.getElementById("verify-panel")?.classList.add("hidden");
      loadVerifierComplaints();
      if (document.getElementById("verif-stat-done")) {
        const cur = parseInt(document.getElementById("verif-stat-done").textContent || "0");
        document.getElementById("verif-stat-done").textContent = cur + 1;
      }
    } else {
      showError("verify-error", data.message || "Verification failed");
    }
  } catch (err) {
    showError("verify-error", "Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Submit Decision"; }
  }
}

// ============================================================
// STAFF
// ============================================================

async function loadStaffComplaints() {
  const container = document.getElementById("complaints-container");
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton" style="height:120px;margin-bottom:0.875rem;"></div>
    <div class="skeleton" style="height:120px;"></div>
  `;
  try {
    const resp = await fetch("/staff_complaints");
    const data = await resp.json();
    const complaints = data.data || [];

    if (document.getElementById("staff-stat-assigned")) {
      document.getElementById("staff-stat-assigned").textContent = complaints.length;
      document.getElementById("staff-stat-resolved").textContent = complaints.filter(c => c.status === "Resolved").length;
    }

    if (complaints.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h4>No assignments yet</h4><p>You haven't been assigned any complaints. Check back later.</p></div>`;
      return;
    }

    container.innerHTML = "";
    complaints.forEach(c => {
      const div  = document.createElement("div");
      div.className = "complaint-card";
      const imgHtml = (c.complaint_images || []).map(u => `<img src="${u}" class="complaint-thumb" onclick="viewImage('${u}')" alt="complaint image" />`).join("");
      const workHtml = (c.work_images || []).length > 0
        ? `<div style="margin-top:0.75rem;"><div class="section-title">Work Done</div><div class="thumb-row">${c.work_images.map(u => `<img src="${u}" class="work-thumb" onclick="viewImage('${u}')" alt="work" />`).join("")}</div></div>`
        : "";

      div.innerHTML = `
        <div class="complaint-card-header">
          <h3 class="complaint-card-title">${escapeHtml(c.title || "Untitled")}</h3>
          <span class="status-pill ${mapStatusClass(c.status)}">${escapeHtml(c.status)}</span>
        </div>
        <div class="complaint-card-meta">
          <span>📍 ${escapeHtml(c.city||"")}${c.pincode ? ` — ${escapeHtml(c.pincode)}` : ""}</span>
          <span>🕐 ${timeAgo(c.created_at)}</span>
          ${c.creator ? `<span>👤 ${escapeHtml(c.creator.first_name||"")} ${escapeHtml(c.creator.last_name||"")}</span>` : ""}
        </div>
        <p class="complaint-card-desc">${escapeHtml(c.description||"")}</p>
        ${imgHtml ? `<div class="thumb-row">${imgHtml}</div>` : ""}
        ${workHtml}
        <div class="complaint-card-footer">
          ${c.status !== "Resolved" && c.status !== "Closed"
            ? `<button class="btn btn-primary btn-sm" onclick="selectProgressComplaint('${c.id}','${escapeHtml(c.title||"").replace(/'/g,"\\'")}')">📝 Update Progress</button>`
            : `<span style="color:var(--green);font-size:0.85rem;font-weight:600;">✅ Resolved</span>`}
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function selectProgressComplaint(id, title) {
  document.getElementById("progress-complaint-id").value = id;
  document.getElementById("progress-selected-title").textContent = title;
  const panel = document.getElementById("progress-panel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function handleStaffProgress(e) {
  e.preventDefault();
  const complaint_id = document.getElementById("progress-complaint-id")?.value || "";
  const status       = document.getElementById("progress_status")?.value || "";
  const filesInput   = document.getElementById("work_images");

  if (!complaint_id) return showError("progress-error", "No complaint selected");

  const btn = document.getElementById("progress-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }

  const fd = new FormData();
  fd.append("complaint_id", complaint_id);
  if (status) fd.append("status", status);
  if (filesInput?.files?.length) {
    for (let i = 0; i < filesInput.files.length; i++) fd.append("work_images", filesInput.files[i]);
  }

  try {
    const resp = await fetch("/staff_update", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) {
      showToast("Progress updated successfully!", "success");
      document.getElementById("progress-form")?.reset();
      document.getElementById("progress-preview-row").innerHTML = "";
      document.getElementById("progress-panel")?.classList.add("hidden");
      loadStaffComplaints();
    } else {
      showError("progress-error", data.message || "Update failed");
    }
  } catch (err) {
    showError("progress-error", "Network error.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📤 Submit Update"; }
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

let _notifPollInterval = null;

function initNotifications() {
  loadNotificationsCount();
  _notifPollInterval = setInterval(loadNotificationsCount, 60000);
}

async function loadNotificationsCount() {
  try {
    const resp = await fetch("/notifications");
    const data = await resp.json();
    if (!data.success) return;
    const badge = document.getElementById("notif-badge");
    if (badge) {
      const count = data.unread_count || 0;
      badge.textContent = count > 9 ? "9+" : count;
      badge.classList.toggle("hidden", count === 0);
    }
  } catch (e) {}
}

async function loadNotifications() {
  const list = document.getElementById("notif-list");
  if (!list) return;
  try {
    const resp = await fetch("/notifications");
    const data = await resp.json();
    if (!data.success) { list.innerHTML = `<div class="notif-empty">Failed to load.</div>`; return; }
    const notifs = data.data || [];
    if (notifs.length === 0) {
      list.innerHTML = `<div class="notif-empty">🔔 No notifications yet</div>`;
      return;
    }
    list.innerHTML = notifs.slice(0, 15).map(n => `
      <div class="notif-item ${!n.read ? "unread" : ""}" data-id="${n.id}" onclick="markOneRead('${n.id}', this)">
        <div class="notif-dot"></div>
        <div class="notif-item-content">
          <div class="notif-item-msg">${escapeHtml(n.message || (n.payload?.message || "Update received"))}</div>
          <div class="notif-item-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<div class="notif-empty">Failed to load notifications.</div>`;
  }
}

async function markOneRead(id, el) {
  el?.classList.remove("unread");
  try {
    await fetch("/api/mark_notification_read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: id }),
    });
    loadNotificationsCount();
  } catch (e) {}
}

async function markAllRead() {
  try {
    await fetch("/api/mark_notification_read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    document.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
    const badge = document.getElementById("notif-badge");
    if (badge) { badge.textContent = "0"; badge.classList.add("hidden"); }
    showToast("All notifications marked as read", "success");
  } catch (e) {}
}

// ============================================================
// NEARBY COMPLAINTS
// ============================================================

async function loadNearbyComplaints() {
  const pincode   = (document.getElementById("nearby-pincode")?.value || "").trim();
  const container = document.getElementById("nearby-container");
  if (!container) return;
  if (!pincode && !pincode) {
    container.innerHTML = `<div class="empty-state"><p>Enter a pincode to search.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;
  try {
    const resp = await fetch(`/api/nearby_complaints?pincode=${encodeURIComponent(pincode)}`);
    const data = await resp.json();
    const complaints = data.data || [];
    if (complaints.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗺</div><h4>No nearby complaints</h4><p>No complaints found in pincode ${escapeHtml(pincode)}.</p></div>`;
      return;
    }
    container.innerHTML = `
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.875rem;">${complaints.length} complaint${complaints.length !== 1 ? "s" : ""} found in this area</p>
      <div class="nearby-scroll">
        ${complaints.map(c => `
          <div class="nearby-card">
            <div class="nearby-card-title">${escapeHtml(c.title || "Untitled")}</div>
            <div style="margin:0.375rem 0;"><span class="status-pill ${mapStatusClass(c.status)}" style="font-size:0.65rem;">${escapeHtml(c.status)}</span></div>
            <div class="nearby-card-meta">📍 ${escapeHtml(c.city||"")} · ${timeAgo(c.created_at)}</div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load nearby complaints.</p></div>`;
  }
}

// ============================================================
// ESCALATION
// ============================================================

let _escalationComplaintId = null;

async function openEscalationModal(complaintId) {
  _escalationComplaintId = complaintId;
  try {
    const resp = await fetch("/api/escalation_info");
    const data = await resp.json();
    const email   = data.email   || "grievance@mrcivil.gov.in";
    const twitter = data.twitter || "MrCivilGrievance";

    const subject = encodeURIComponent(`Complaint Escalation — ID: ${complaintId}`);
    const body    = encodeURIComponent(`Dear Team,\n\nI am escalating my complaint (ID: ${complaintId}) as it has not been resolved satisfactorily.\n\nPlease look into this matter urgently.\n\nThank you.`);
    const tweet   = encodeURIComponent(`@${twitter} I am escalating my complaint (ID: ${complaintId}). It has been pending for over 3 days with no resolution. #PublicGrievance #MrCivil`);

    const emailLink   = document.getElementById("escalation-email-link");
    const twitterLink = document.getElementById("escalation-twitter-link");
    if (emailLink)   { emailLink.href = `mailto:${email}?subject=${subject}&body=${body}`; emailLink.querySelector("span").textContent = `Email ${email}`; }
    if (twitterLink) { twitterLink.href = `https://twitter.com/intent/tweet?text=${tweet}`; twitterLink.querySelector("span").textContent = `Post on X — @${twitter}`; }

    const modal = document.getElementById("escalation-modal");
    modal.classList.remove("hidden");
    setTimeout(() => modal.classList.add("show"), 10);
  } catch (e) {
    showToast("Failed to load escalation info", "danger");
  }
}

function closeEscalationModal() {
  const modal = document.getElementById("escalation-modal");
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 200);
}

// ============================================================
// STAFF RATING MODAL
// ============================================================

async function showRatingModal(complaintId, title) {
  // Check if already rated
  try {
    const r = await fetch(`/api/my_rating?complaint_id=${complaintId}`);
    const d = await r.json();
    if (d.success && d.data) {
      openModal("Your Rating", `
        <p style="margin-bottom:1rem;">You rated this complaint:</p>
        <div style="display:flex;align-items:center;gap:0.5rem;font-size:1.5rem;margin-bottom:0.5rem;">
          ${starsHtml(d.data.rating)}
        </div>
        <p style="color:var(--text-muted);font-size:0.875rem;">${escapeHtml(d.data.comments || "No comment")}</p>
      `);
      return;
    }
  } catch (e) {}

  openModal(`⭐ Rate Staff — ${title}`, `
    <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:1.25rem;">
      How satisfied are you with how this complaint was handled?
    </p>
    <form id="rating-form" novalidate>
      <input type="hidden" name="complaint_id" value="${complaintId}" />
      <div class="form-group">
        <label class="form-label">Your Rating</label>
        <div class="star-rating" role="radiogroup" aria-label="Rating">
          ${[5,4,3,2,1].map(n => `
            <label for="star-${n}" title="${n} star${n>1?"s":""}">
              <input type="radio" id="star-${n}" name="rating" value="${n}" />★
            </label>
          `).join("")}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="rating-comments">Comments (optional)</label>
        <textarea class="form-control" id="rating-comments" name="comments" placeholder="Tell us about your experience…" style="min-height:80px;"></textarea>
      </div>
      <div class="error-msg" id="rating-error" aria-live="polite"></div>
      <button type="submit" class="btn btn-primary btn-full">Submit Rating</button>
    </form>
  `);

  document.getElementById("rating-form")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    const rating   = document.querySelector('input[name="rating"]:checked')?.value;
    const comments = document.getElementById("rating-comments")?.value || "";
    if (!rating) return showError("rating-error", "Please select a rating");
    try {
      const resp = await fetch("/api/rate_staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint_id: complaintId, rating: parseInt(rating), comments }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast("Thank you for your rating! ⭐", "success");
        closeModal();
      } else {
        showError("rating-error", data.message || "Rating failed");
      }
    } catch (err) {
      showError("rating-error", "Network error.");
    }
  });
}

// ============================================================
// FEEDBACK MODAL
// ============================================================

function showFeedbackModal(complaintId) {
  openModal("💬 Submit Feedback", `
    <form id="feedback-form" novalidate>
      <input type="hidden" name="complaint_id" value="${complaintId}" />
      <div class="form-group">
        <label class="form-label" for="fb-rating">Overall Satisfaction</label>
        <select class="form-select" id="fb-rating" name="rating" required>
          <option value="">Choose…</option>
          <option value="5">5 — Very Satisfied ⭐⭐⭐⭐⭐</option>
          <option value="4">4 — Satisfied ⭐⭐⭐⭐</option>
          <option value="3">3 — Neutral ⭐⭐⭐</option>
          <option value="2">2 — Dissatisfied ⭐⭐</option>
          <option value="1">1 — Very Dissatisfied ⭐</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="fb-comments">Comments</label>
        <textarea class="form-control" id="fb-comments" name="comments" placeholder="Share your experience…" style="min-height:80px;"></textarea>
      </div>
      <div class="error-msg" id="feedback-error" aria-live="polite"></div>
      <button type="submit" class="btn btn-primary btn-full">Submit Feedback</button>
    </form>
  `);

  document.getElementById("feedback-form")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    const rating   = document.getElementById("fb-rating")?.value;
    const comments = document.getElementById("fb-comments")?.value || "";
    if (!rating) return showError("feedback-error", "Please select a rating");
    try {
      const resp = await fetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint_id: complaintId, rating: parseInt(rating), comments }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast("Thank you for your feedback!", "success");
        closeModal();
      } else {
        showError("feedback-error", data.message || "Failed");
      }
    } catch (err) {
      showError("feedback-error", "Network error.");
    }
  });
}

// ============================================================
// DRAG-DROP UPLOAD
// ============================================================

function setupDropZone(zoneId, inputId, previewId) {
  const zone    = document.getElementById(zoneId);
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const dt = e.dataTransfer;
    if (dt?.files) handleFilePreview(dt.files, preview, input);
  });
  input.addEventListener("change", () => handleFilePreview(input.files, preview, input));
}

function handleFilePreview(files, previewEl, input) {
  if (!previewEl || !files) return;
  previewEl.innerHTML = "";
  Array.from(files).forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const item = document.createElement("div");
      item.className = "image-preview-item";
      item.innerHTML = `
        <img src="${ev.target.result}" alt="preview" />
        <button class="remove-img" onclick="removePreviewImg(this, ${i})" title="Remove">✕</button>
      `;
      previewEl.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function removePreviewImg(btn, idx) {
  btn.closest(".image-preview-item")?.remove();
}

// ============================================================
// ESCALATION MODAL close on backdrop click
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("escalation-modal")?.addEventListener("click", e => {
    if (e.target.id === "escalation-modal") closeEscalationModal();
  });
});
