import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const roomEl = document.querySelector("#room");
const answerForm = document.querySelector("#answer-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/state");
  if (!data.room) {
    roomEl.innerHTML = "<p>Escapaste. Felicitaciones.</p>";
    answerForm.classList.add("hidden");
    return;
  }
  roomEl.innerHTML = `<h2>${data.room.title}</h2><p>${data.room.text}</p><p>Progreso: ${data.progress.room + 1} / ${data.total}</p>`;
  answerForm.classList.remove("hidden");
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/answer", { method: "POST", body: JSON.stringify({ answer: document.querySelector("#answer").value.trim() }) });
    answerForm.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
document.querySelector("#reset").addEventListener("click", async () => {
  await api("/api/reset", { method: "POST" });
  await refresh();
});
boot();
