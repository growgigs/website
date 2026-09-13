document.querySelectorAll(".menu-toggle").forEach(function (btn) {
  var links = btn.closest(".nav").querySelector(".nav-links");
  btn.addEventListener("click", function () {
    var open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  links.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () {
      links.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  });
});
