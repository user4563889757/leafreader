// Runs before first paint so the saved theme never flashes.
try {
  const stored = JSON.parse(localStorage.getItem("leafreader:theme"));
  document.documentElement.dataset.theme =
    stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  document.documentElement.dataset.theme = "light";
}
