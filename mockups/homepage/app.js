const searchInput = document.querySelector("#shop-search");
const cards = [...document.querySelectorAll("[data-shop-card]")];
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const cityTrigger = document.querySelector("#city-trigger");
const cityMenu = document.querySelector(".city-menu");
const cityLabel = document.querySelector("#current-city");
const resultsMeta = document.querySelector("#results-meta");
const emptyState = document.querySelector("#empty-state");
const shopGrid = document.querySelector("#shop-grid");
const dialog = document.querySelector("#demo-dialog");
let activeCategory = "Toutes";
let activeCity = "Abidjan";

function normalizeSearchText(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

function updateResults() {
  const query = normalizeSearchText(searchInput.value.trim());
  let visibleCount = 0;

  cards.forEach((card) => {
    const matchesQuery = !query || normalizeSearchText(`${card.dataset.name} ${card.dataset.search}`).includes(query);
    const matchesCategory = activeCategory === "Toutes" || card.dataset.category === activeCategory;
    const matchesCity = activeCity === "Toutes les villes" || card.dataset.city === activeCity;
    const isVisible = matchesQuery && matchesCategory && matchesCity;
    card.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  resultsMeta.textContent = visibleCount === 0
    ? "Aucune boutique"
    : `${visibleCount} boutique${visibleCount > 1 ? "s" : ""}`;
  document.querySelector("#reset-filters").hidden = !query && activeCategory === "Toutes" && activeCity === "Abidjan";
  emptyState.hidden = visibleCount > 0;
  shopGrid.hidden = visibleCount === 0;
}

function setCategory(category) {
  activeCategory = category;
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === category;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  updateResults();
  document.querySelector("#boutiques").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDialog(title, copy) {
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-copy").textContent = copy;
  dialog.showModal();
}

searchInput.addEventListener("input", updateResults);
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  updateResults();
  document.querySelector("#boutiques").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll("[data-search]").forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.search;
    activeCategory = "Toutes";
    filterButtons.forEach((filter) => {
      const isActive = filter.dataset.filter === "Toutes";
      filter.classList.toggle("is-active", isActive);
      filter.setAttribute("aria-pressed", String(isActive));
    });
    updateResults();
    document.querySelector("#boutiques").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

filterButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
  button.addEventListener("click", () => setCategory(button.dataset.filter));
});
cityTrigger.addEventListener("click", () => {
  const isExpanded = cityTrigger.getAttribute("aria-expanded") === "true";
  cityTrigger.setAttribute("aria-expanded", String(!isExpanded));
  cityMenu.hidden = isExpanded;
});
cityMenu.querySelectorAll("[data-city]").forEach((option) => {
  option.addEventListener("click", () => {
    activeCity = option.dataset.city;
    cityLabel.textContent = activeCity;
    cityMenu.querySelectorAll("[data-city]").forEach((item) => {
      item.setAttribute("aria-selected", String(item === option));
    });
    cityTrigger.setAttribute("aria-expanded", "false");
    cityMenu.hidden = true;
    updateResults();
    document.querySelector("#boutiques").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".city-picker")) {
    cityTrigger.setAttribute("aria-expanded", "false");
    cityMenu.hidden = true;
  }
});

document.querySelectorAll("[data-shop]").forEach((button) => {
  button.addEventListener("click", () => {
    showDialog(
      button.dataset.shop,
      "Cette boutique et son catalogue sont des exemples fictifs de la maquette. Dans le site, ce bouton ouvrira la vitrine publique du commerçant."
    );
  });
});
document.querySelectorAll('[data-dialog="merchant"]').forEach((button) => {
  button.addEventListener("click", () => {
    showDialog(
      "Une vitrine à votre image",
      "Cette maquette est séparée du site en production. Le bouton sera relié au parcours de création de boutique si cette direction est retenue."
    );
    document.querySelector("#main-nav").classList.remove("is-open");
    document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  });
});
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
document.querySelector(".dialog-confirm").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

document.querySelector("#reset-filters").addEventListener("click", resetFilters);
document.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);
function resetFilters() {
  searchInput.value = "";
  activeCategory = "Toutes";
  activeCity = "Abidjan";
  cityLabel.textContent = activeCity;
  cityMenu.querySelectorAll("[data-city]").forEach((item) => {
    item.setAttribute("aria-selected", String(item.dataset.city === activeCity));
  });
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === "Toutes";
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  updateResults();
}

const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  menuToggle.setAttribute("aria-label", isExpanded ? "Ouvrir le menu" : "Fermer le menu");
  document.querySelector("#main-nav").classList.toggle("is-open", !isExpanded);
});
document.querySelectorAll('#main-nav a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector("#main-nav").classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Ouvrir le menu");
  });
});

updateResults();
