
(() => {
  const pictures = Array.from(
    { length: 6 },
    (_, i) => `./stickers/sticker-${i + 1}.png`
  );

  let previous = -1;
  let overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  function show() {
    close();

    let index = Math.floor(Math.random() * pictures.length);

    if (pictures.length > 1 && index === previous) {
      index = (index + 1) % pictures.length;
    }

    previous = index;

    overlay = document.createElement("div");
    overlay.id = "talmaza-sticker-overlay";

    const img = document.createElement("img");
    img.src = pictures[index];
    img.alt = "رسالة تشجيع";
    img.className = "talmaza-popup-sticker";

    img.onerror = () => {
      console.error("Sticker image not found:", img.src);
    };

    img.addEventListener("click", close);
    overlay.addEventListener("click", close);

    overlay.appendChild(img);
    document.body.appendChild(overlay);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  window.TalmazaSticker = { show, close };
})();
