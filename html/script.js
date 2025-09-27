//-------------------------Reply Comments------------------//
window.toggleReply = function (btn) {
  var comment = btn.closest('.comment-item');
  if (!comment) return;
  var box = comment.querySelector('.reply-box');
  if (!box) return;

  box.hidden = !box.hidden;

  // Enfocar el textarea al abrir
  if (!box.hidden) {
    var ta = box.querySelector('textarea');
    if (ta) ta.focus();
  }
};

window.closeReply = function (btn) {
  var box = btn.closest('.reply-box');
  if (box) box.hidden = true;
};

// (Opcional) Evitar envío real de la respuesta en esta vista de demo
document.addEventListener('submit', function (e) {
  var form = e.target.closest('.reply-form');
  if (form) {
    e.preventDefault();
    form.reset();
    var box = form.closest('.reply-box');
    if (box) box.hidden = true;
  }
});



const avatar = document.getElementById("userAvatar");
const dropdown = document.getElementById("userDropdown");

avatar.addEventListener("click", () => {
    dropdown.classList.toggle("show");
});

// opcional: cerrar al hacer click fuera
document.addEventListener("click", (e) => {
    if (!avatar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove("show");
    }
});

document.addEventListener("DOMContentLoaded", () => {
  const dateElement = document.getElementById("inclusionDate");
  const today = new Date();
  const formatted = today.toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  dateElement.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
});

