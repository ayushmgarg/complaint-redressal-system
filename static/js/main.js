// static/js/main.js
document.addEventListener("DOMContentLoaded", () => {
  // Forms
  

  const regForm = document.getElementById("registration-form");
  if (regForm) regForm.addEventListener("submit", handleRegistration);

  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  const complaintForm = document.getElementById("complaint-form");
  if (complaintForm) complaintForm.addEventListener("submit", handleComplaintSubmission);

  const updateForm = document.getElementById("update-form");
  if (updateForm) updateForm.addEventListener("submit", handleComplaintUpdate);

  const verifyForm = document.getElementById("verify-form");
  if (verifyForm) verifyForm.addEventListener("submit", handleVerificationSubmit);

  const progressForm = document.getElementById("progress-form");
  if (progressForm) progressForm.addEventListener("submit", handleStaffProgress);

  // On dashboard pages (user/admin) load complaints
  const path = window.location.pathname;
  if (path.includes("/user") || path.includes("/admin")) {
    loadComplaints();
    loadStaffIntoAdminDropdown(); 

  }
  if (path.includes("/verifier")) {
    loadVerifierComplaints();
  }
  if (path.includes("/staff")) {
    loadStaffComplaints();
  }
});

/* -------------------------
   Validation helpers
   ------------------------- */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}
function digitsOnly(s){ return (s||"").replace(/\D/g, ""); }
function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("visually-hidden");
  showToast(msg, "danger");
  setTimeout(()=>{ el.classList.add("visually-hidden"); }, 8000);
}

/* -------------------------
   Toasts (Bootstrap 5)
   ------------------------- */
function showToast(message, variant = "success") {
  try {
    const container = document.getElementById("toast-container");
    if (!container) return alert(message);
    const wrapper = document.createElement("div");
    wrapper.className = `toast align-items-center text-bg-${variant} border-0`;
    wrapper.setAttribute("role", "status");
    wrapper.setAttribute("aria-live", "polite");
    wrapper.setAttribute("aria-atomic", "true");
    wrapper.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    container.appendChild(wrapper);
    const t = new bootstrap.Toast(wrapper, { delay: 3500 });
    t.show();
    wrapper.addEventListener("hidden.bs.toast", ()=> wrapper.remove());
  } catch (_) {
    try { alert(message); } catch (e) {}
  }
}

/* -------------------------
   Registration
   ------------------------- */
async function handleRegistration(e) {
  e.preventDefault();
  const form = e.target;
  const first = form.querySelector("#first_name").value.trim();
  const last = form.querySelector("#last_name").value.trim();
  const aadhar = digitsOnly(form.querySelector("#aadhar_card").value);
  const email = form.querySelector("#email").value.trim().toLowerCase();
  const phone = digitsOnly(form.querySelector("#phone_number").value);
  const password = form.querySelector("#password").value;

  if (!first) return showError("register-error", "First name required");
  if (!/^\d{12}$/.test(aadhar)) return showError("register-error", "Aadhar must be 12 digits");
  if (!isValidEmail(email)) return showError("register-error", "Enter a valid email");
  if (!/^\d{10}$/.test(phone)) return showError("register-error", "Phone must be 10 digits");
  if (!password || password.length < 6) return showError("register-error", "Password must be at least 6 characters");

  const payload = { first_name: first, last_name: last, aadhar_card: aadhar, email, phone_number: phone, password };

  try {
    const resp = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      showToast("Registered successfully. Please login.", "success");
      window.location.href = "/";
    } else {
      showError("register-error", data.message || "Registration failed");
    }
  } catch (err) {
    showError("register-error", err.message || "Request failed");
  }
}

/* -------------------------
   Login
   ------------------------- */
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector("#login_email").value.trim().toLowerCase();
  const password = form.querySelector("#login_password").value;
  const login_type = (form.querySelector("#login_type") || {}).value || "user";

  if (!isValidEmail(email)) return showError("login-error", "Enter valid email");
  if (!password) return showError("login-error", "Password required");

  try {
    const resp = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email, password, login_type })
    });
    const data = await resp.json();
    if (data.success) {
      showToast("Logged in", "success");
      if (data.user_type === "admin") window.location.href = "/admin";
      else window.location.href = "/user";
    } else {
      showError("login-error", data.message || "Login failed");
    }
  } catch (err) {
    showError("login-error", err.message || "Login error");
  }
}

/* -------------------------
   Complaint submission (user)
   ------------------------- */
async function handleComplaintSubmission(e) {
  e.preventDefault();
  const form = e.target;
  const title = form.querySelector("#title").value.trim();
  const description = form.querySelector("#description").value.trim();
  const city = form.querySelector("#city").value.trim();
  const pincode = digitsOnly(form.querySelector("#pincode").value.trim());
  const landmark = form.querySelector("#landmark").value.trim();
  const files = form.querySelector("#complaint_images").files;

  if (!title) return showError("complaint-error", "Title is required");
  if (!description || description.length < 10) return showError("complaint-error", "Provide a more detailed description (min 10 chars)");
  if (!city) return showError("complaint-error", "City is required");
  if (!/^\d{6}$/.test(pincode)) return showError("complaint-error", "Pincode must be 6 digits");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", description);
  fd.append("city", city);
  fd.append("pincode", pincode);
  fd.append("landmark", landmark);
  // append files
  if (files && files.length) {
    for (let i=0;i<files.length;i++) fd.append("complaint_images", files[i]);
  }

  try {
    const resp = await fetch("/submit_complaint", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) {
      showToast("Complaint submitted.", "success");
      form.reset();
      loadComplaints();
    } else {
      showError("complaint-error", data.message || "Submission failed");
    }
  } catch (err) {
    showError("complaint-error", err.message || "Request failed");
  }
}

/* -------------------------
/* -------------------------
   Load complaints (user or admin)
   ------------------------- */
async function loadComplaints() {
  try {
    const resp = await fetch("/get_complaints");
    const data = await resp.json();
    if (!data.success) return console.error("Could not fetch complaints", data);
    const container = document.getElementById("complaints-container");
    container.innerHTML = "";
    (data.data || []).forEach(c => {
      const div = document.createElement("div");
      div.className = "complaint-card p-3 mb-2 border rounded";

      const userInfo = c.users ? `<p class="text-muted small">User: ${c.users.first_name} ${c.users.last_name} — ${c.users.phone_number || ""} / ${c.users.email || ""}</p>` : "";
      const statusClass = mapStatusClass(c.status);
      const statusPill = `<span class="status-pill ${statusClass}"><i class="bi bi-circle"></i> ${escapeHtml(c.status || "Open")}</span>`;

      // Complaint images
      const complaintImgsHTML = (c.complaint_images || []).map(u => `<img src="${u}" class="complaint-thumb" />`).join("");

      // Work images (uploaded by admin/staff)
      const workImgsHTML = (c.work_images && c.work_images.length > 0) ? `
        <div class="work-images-section mt-3">
          <h5>Work Progress Images</h5>
          <div class="d-flex flex-wrap gap-2">
            ${c.work_images.map(url => `<img src="${url}" class="work-thumb" />`).join('')}
          </div>
        </div>
      ` : "";

      div.innerHTML = `
        <h3>${escapeHtml(c.title || "Untitled")}</h3>
        <div class="d-flex align-items-center justify-content-between">${userInfo}<div>${statusPill}</div></div>
        <p>${escapeHtml(c.description || "")}</p>
        <p><strong>City:</strong> ${escapeHtml(c.city||"")} <strong>Pincode:</strong> ${escapeHtml(c.pincode||"")}</p>
        <div>${complaintImgsHTML}</div>
        ${workImgsHTML}
      `;

      // if admin page, add update button
      if (window.location.pathname.includes("/admin")) {
        const btnRow = document.createElement("div");
        btnRow.className = "d-flex gap-2 mt-2";
        const btn = document.createElement("button");
        btn.textContent = "Edit / Assign";
        btn.className = "btn btn-sm btn-sky";
        btn.onclick = () => {
          const updateForm = document.getElementById("update-form");
          if (!updateForm) return alert("Update form not present");
          updateForm.querySelector("[name='complaint_id']").value = c.id;
          window.scrollTo(0, updateForm.offsetTop - 20);
        };
        const btn2 = document.createElement("a");
        btn2.href = "#complaints-container";
        btn2.className = "btn btn-sm btn-outline-secondary";
        btn2.textContent = "Details";
        btnRow.appendChild(btn);
        btnRow.appendChild(btn2);
        div.appendChild(btnRow);
      }

      if ((c.status === 'Resolved' || c.status === 'Closed') && !window.location.pathname.includes("/admin")) {
        const feedbackBtn = document.createElement("button");
        feedbackBtn.textContent = "Provide Feedback";
        feedbackBtn.className = "btn btn-sm btn-success mt-2";
        feedbackBtn.onclick = () => showFeedbackModal(c.id);
        div.appendChild(feedbackBtn);
    }

      container.appendChild(div);
    });
  } catch (err) {
    console.error("Error loading complaints:", err);
  }
}

// Add these new functions anywhere in main.js

function showFeedbackModal(complaintId) {
  const modalBody = document.getElementById('genericModalBody');
  modalBody.innerHTML = `
    <form id="feedback-form">
      <input type="hidden" name="complaint_id" value="${complaintId}">
      <div class="mb-3">
        <label for="rating" class="form-label">Rating (1-5)</label>
        <select class="form-select" name="rating" id="rating" required>
          <option value="">Choose a rating</option>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Poor</option>
          <option value="1">1 - Very Poor</option>
        </select>
      </div>
      <div class="mb-3">
        <label for="comments" class="form-label">Comments</label>
        <textarea class="form-control" name="comments" id="comments" rows="3"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">Submit Feedback</button>
      <p id="feedback-error" class="text-danger small mt-2"></p>
    </form>
  `;

  // Attach submit event listener
  modalBody.querySelector('#feedback-form').addEventListener('submit', handleFeedbackSubmit);
  
  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById('genericModal'));
  document.getElementById('genericModalLabel').textContent = 'Submit Your Feedback';
  modal.show();
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const complaint_id = form.querySelector('[name="complaint_id"]').value;
  const rating = form.querySelector('[name="rating"]').value;
  const comments = form.querySelector('[name="comments"]').value;

  if (!rating) {
    document.getElementById('feedback-error').textContent = 'Please select a rating.';
    return;
  }

  try {
    const resp = await fetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaint_id, rating, comments })
    });
    const data = await resp.json();
    if (data.success) {
      showToast('Thank you for your feedback!', 'success');
      bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide();
    } else {
      document.getElementById('feedback-error').textContent = data.message || 'Submission failed.';
    }
  } catch (err) {
    document.getElementById('feedback-error').textContent = 'A network error occurred.';
  }
}

async function loadStaffIntoAdminDropdown() {
  try {
    const resp = await fetch("/api/get_staff");
    const data = await resp.json();
    if (data.success) {
      const selectEl = document.getElementById("assigned_to");
      selectEl.innerHTML = '<option value="">-- Select Staff --</option>'; // Clear existing
      data.data.forEach(staff => {
        const option = document.createElement("option");
        option.value = staff.id;
        option.textContent = `${staff.first_name || ''} ${staff.last_name || ''} (${staff.id.substring(0,8)}...)`;
        selectEl.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load staff list:", err);
  }
}


/* -------------------------
   Verifier list
   ------------------------- */
async function loadVerifierComplaints() {
  try {
    const resp = await fetch("/verifier_complaints");
    const data = await resp.json();
    if (!data.success) return console.error("Could not fetch verifier complaints", data);
    const container = document.getElementById("complaints-container");
    container.innerHTML = "";
    (data.data || []).forEach(c => {
      const div = document.createElement("div");
      div.className = "complaint-card p-3 mb-2 border rounded";
      const imgsHTML = (c.complaint_images || []).map(u => `<img src="${u}" class="complaint-thumb" />`).join("");
      div.innerHTML = `
        <h3>${escapeHtml(c.title || "Untitled")}</h3>
        <p class="text-muted">User: ${c.users ? escapeHtml(`${c.users.first_name||""} ${c.users.last_name||""}`) : "-"}</p>
        <p>${escapeHtml(c.description || "")}</p>
        <p><strong>Status:</strong> ${escapeHtml(c.status || "Open")}</p>
        <div>${imgsHTML}</div>
      `;
      const btn = document.createElement("button");
      btn.textContent = "Verify / Reject";
      btn.className = "btn btn-sm btn-outline-secondary mt-2";
      btn.onclick = () => {
        const form = document.getElementById("verify-form");
        if (!form) return showToast("Verify form not present", "danger");
        form.querySelector("[name='complaint_id']").value = c.id;
        window.scrollTo(0, form.offsetTop - 20);
      };
      div.appendChild(btn);
      container.appendChild(div);
    });
  } catch (err) { console.error("Error loading verifier complaints:", err); }
}

/* -------------------------
   Staff list
   ------------------------- */
async function loadStaffComplaints() {
  try {
    const resp = await fetch("/staff_complaints");
    const data = await resp.json();
    if (!data.success) return console.error("Could not fetch staff complaints", data);
    const container = document.getElementById("complaints-container");
    container.innerHTML = "";
    (data.data || []).forEach(c => {
      const div = document.createElement("div");
      div.className = "complaint-card p-3 mb-2 border rounded";
      const imgsHTML = (c.complaint_images || []).map(u => `<img src="${u}" class="complaint-thumb" />`).join("");
      div.innerHTML = `
        <h3>${escapeHtml(c.title || "Untitled")}</h3>
        <p class="text-muted">User: ${c.users ? escapeHtml(`${c.users.first_name||""} ${c.users.last_name||""}`) : "-"}</p>
        <p>${escapeHtml(c.description || "")}</p>
        <p><strong>Status:</strong> ${escapeHtml(c.status || "Open")}</p>
        <div>${imgsHTML}</div>
      `;
      const btn = document.createElement("button");
      btn.textContent = "Set progress";
      btn.className = "btn btn-sm btn-outline-secondary mt-2";
      btn.onclick = () => {
        const form = document.getElementById("progress-form");
        if (!form) return showToast("Progress form not present", "danger");
        form.querySelector("[name='complaint_id']").value = c.id;
        window.scrollTo(0, form.offsetTop - 20);
      };
      div.appendChild(btn);
      container.appendChild(div);
    });
  } catch (err) { console.error("Error loading staff complaints:", err); }
}

/* -------------------------
   Verifier submit
   ------------------------- */
async function handleVerificationSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const complaint_id = form.querySelector("[name='complaint_id']").value;
  const verification_status = form.querySelector("[name='verification_status']").value;
  const verification_notes = form.querySelector("[name='verification_notes']").value;
  if (!complaint_id) return showError("verify-error", "Missing complaint id");
  try {
    const resp = await fetch("/verify_complaint", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ complaint_id, verification_status, verification_notes }) });
    const data = await resp.json();
    if (data.success) { showToast("Verification saved", "success"); form.reset(); loadVerifierComplaints(); }
    else { showError("verify-error", data.message || "Verification failed"); }
  } catch (err) { showError("verify-error", err.message || "Request failed"); }
}

/* -------------------------
   Staff progress submit
   ------------------------- */
async function handleStaffProgress(e) {
  e.preventDefault();
  const form = e.target;
  const complaint_id = form.querySelector("[name='complaint_id']").value;
  const status = form.querySelector("[name='status']").value;
  const files = form.querySelector("[name='work_images']").files;
  if (!complaint_id) return showError("progress-error", "Missing complaint id");
  const fd = new FormData();
  fd.append("complaint_id", complaint_id);
  if (status) fd.append("status", status);
  if (files && files.length) { for (let i=0;i<files.length;i++) fd.append("work_images", files[i]); }
  try {
    const resp = await fetch("/staff_update", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) { showToast("Progress updated", "success"); form.reset(); loadStaffComplaints(); }
    else { showError("progress-error", data.message || "Update failed"); }
  } catch (err) { showError("progress-error", err.message || "Request failed"); }
}

/* -------------------------
   Admin update complaint
   ------------------------- */
async function handleComplaintUpdate(e) {
  e.preventDefault();
  const form = e.target;
  const complaint_id = form.querySelector("[name='complaint_id']").value;
  const status = form.querySelector("[name='status']").value;
  const assigned_to = form.querySelector("[name='assigned_to']").value.trim();
  const files = form.querySelector("[name='work_images']").files;

  if (!complaint_id) return showError("update-error", "Missing complaint id");

  const fd = new FormData();
  fd.append("complaint_id", complaint_id);
  if (status) fd.append("status", status);
  if (assigned_to) fd.append("assigned_to", assigned_to);
  if (files && files.length) {
    for (let i=0;i<files.length;i++) fd.append("work_images", files[i]);
  }

  try {
    const resp = await fetch("/update_complaint", { method: "POST", body: fd });
    const data = await resp.json();
    if (data.success) {
      showToast("Complaint updated", "success");
      form.reset();
      loadComplaints();
    } else {
      showError("update-error", data.message || "Update failed");
    }
  } catch (err) {
    showError("update-error", err.message || "Request failed");
  }
}

/* -------------------------
   Logout
   ------------------------- */
async function logout() {
  try {
    await fetch("/logout");
  } finally {
    window.location.href = "/";
  }
}

/* -------------------------
   Small utilities
   ------------------------- */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, function(m){ return ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\\' :'&#39;' })[m]; });
}

function mapStatusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "open") return "status-open";
  if (s === "verified") return "status-verified";
  if (s === "assigned") return "status-assigned";
  if (s === "in progress") return "status-inprogress";
  if (s === "resolved") return "status-resolved";
  if (s === "closed") return "status-closed";
  if (s === "rejected") return "status-rejected";
  return "status-open";
}
