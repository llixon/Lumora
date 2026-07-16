(function ()
{
    const go = (u) => { if (u) window.location.href = u; };
    window.open = (u) => { go(typeof u === "string" ? u : (u && u.toString())); return null; };

    document.addEventListener("click", (e) =>
    {
        const a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;

        if (a && a.href) { e.preventDefault(); go(a.href); }
    }, true);

    const BAR_H = 36;
    const T = window.__TAURI__ || {};
    const win = T.window ? T.window.getCurrentWindow() : null;
    const wvwin = T.webviewWindow ? T.webviewWindow.getCurrentWebviewWindow() : null;
    const evt = T.event || null;
    const call = (p) => { try { const r = p && p(); if (r && r.catch) r.catch(()=>{}); } catch (_) {} };

    // Small toast used for export feedback
    function toast(msg, isErr)
    {
        let t = document.getElementById("lumora-toast");

        if (!t)
        {
            t = document.createElement("div");
            t.id = "lumora-toast";
            t.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483647;" +
                "max-width:72vw;padding:10px 16px;border-radius:10px;color:#fff;opacity:0;transition:opacity .25s ease;" +
                "font:13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;word-break:break-all;" +
                "background:#241b3d;border:1px solid rgba(154,125,255,.4);box-shadow:0 10px 30px rgba(0,0,0,.5)";
            (document.body || document.documentElement).appendChild(t);
        }

        t.style.borderColor = isErr ? "rgba(229,72,77,.65)" : "rgba(154,125,255,.4)";
        t.textContent = msg;
        requestAnimationFrame(() => { t.style.opacity = "1"; });
        clearTimeout(t._h);
        t._h = setTimeout(() => { t.style.opacity = "0"; }, 5000);
    }

    // Full-window loading overlay, shown on lumo.proton.me
    // only so it never covers the login form on account.proton.me
    function splash()
    {
        if (location.hostname !== "lumo.proton.me") return;
        if (document.getElementById("lumora-splash")) return;

        const el = document.createElement("div");
        el.id = "lumora-splash";
        el.innerHTML = `
      <style>
        #lumora-splash{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:22px;
          background:radial-gradient(60% 55% at 50% 45%,rgba(109,74,255,0.26),transparent 70%),
                     linear-gradient(160deg,#141024,#0d0b16);
          transition:opacity .45s ease;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
        #lumora-splash.hide{opacity:0;pointer-events:none}
        #lumora-splash .orb{position:relative;width:84px;height:84px;border-radius:22px;
          background:radial-gradient(circle at 50% 42%,#9a7dff,#6d4aff 62%,#4a2fd0 100%);
          box-shadow:0 0 0 1px rgba(255,255,255,.06) inset,0 10px 40px rgba(109,74,255,.45);
          animation:lm-bob 3.2s ease-in-out infinite}
        #lumora-splash .orb::after{content:"";position:absolute;inset:0;border-radius:inherit;
          background:radial-gradient(circle at 38% 30%,rgba(255,255,255,.9),transparent 42%);opacity:.85}
        #lumora-splash .wm{font-size:26px;font-weight:650;letter-spacing:.16em;text-transform:uppercase;
          background:linear-gradient(180deg,#fff,#9a7dff);-webkit-background-clip:text;background-clip:text;
          -webkit-text-fill-color:transparent}
        #lumora-splash .dots{display:flex;gap:7px}
        #lumora-splash .dots i{width:7px;height:7px;border-radius:50%;background:#9a7dff;opacity:.4;
          animation:lm-blink 1.4s ease-in-out infinite}
        #lumora-splash .dots i:nth-child(2){animation-delay:.2s}
        #lumora-splash .dots i:nth-child(3){animation-delay:.4s}
        @keyframes lm-bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-7px) scale(1.03)}}
        @keyframes lm-blink{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
      </style>
      <div class="orb"></div><div class="wm">Lumora</div>
      <div class="dots"><i></i><i></i><i></i></div>`;
        (document.body || document.documentElement).appendChild(el);
        let gone = false;
        const hide = () =>
        {
            if (gone) return; gone = true;

            const s = document.getElementById("lumora-splash");
            if (!s) return;
            s.classList.add("hide");
            setTimeout(() => s.remove(), 500);
        };

        window.addEventListener("load", () => setTimeout(hide, 650), { once: true });
        setTimeout(hide, 8000);
    }

    // Scrapes the rendered conversation into Markdown. These selectors match the current Lumo web client and will need updating when Proton changes it
    function convTitle()
    {
        const b = document.querySelector(".conversation-header-title-view button");
        return (b && b.textContent ? b.textContent.trim() : "") || "Lumo conversation";
    }
    function buildTranscript()
    {
        const items = Array.from(document.querySelectorAll("[data-message-role]"));

        const clean = (root) =>
        {
            const c = root.cloneNode(true);
            c.querySelectorAll(".lumo-no-copy,.action-toolbar,.user-toolbar,.thinking-path,button,svg,.lumo-avatar")
                .forEach((n) => n.remove());
            return c;
        };
        const textOf = (root) => (clean(root).innerText || "").replace(/\n{3,}/g, "\n\n").trim();
        const parts = [];

        for (const it of items)
        {
            const role = it.getAttribute("data-message-role") === "user" ? "You" : "Lumo";
            const body = it.querySelector(".lumo-markdown, .progressive-markdown-content");
            let text = body ? textOf(body) : "";
            const files = Array.from(it.querySelectorAll(".file-card-preview")).map(() => "[attached file]").join(" ");
            if (!text && files) text = files;
            if (!text) continue;
            parts.push(`## ${role}\n\n${text}`);
        }

        if (!parts.length) return "";
        return `# ${convTitle()}\n_Exported from Lumora · ${new Date().toLocaleString()}_\n\n${parts.join("\n\n")}\n`;
    }
    function safeName()
    {
        return convTitle().replace(/[^\w\-]+/g, "_").slice(0, 60) || "lumo-conversation";
    }
    function stampName()
    {
        const d = new Date(), p = (n) => String(n).padStart(2, "0");
        return `${safeName()}_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
    }

    // Titlebar, export menu and resize handles. The window is frameless, so all window controls live here,
    // resize handles are needed because frameless windows have no native edge resize
    function chrome()
    {
        if (document.getElementById("lumora-titlebar")) return;

        // Feedback from the Rust side of the export.
        if (evt && evt.listen)
        {
            call(() => evt.listen("save-transcript-done", (e) => toast("Saved to " + e.payload)));
            call(() => evt.listen("save-transcript-error", (e) => toast("Save failed: " + e.payload, true)));
        }

        const css = document.createElement("style");
        css.textContent = `
      body{padding-top:${BAR_H}px !important;box-sizing:border-box !important}
      #lumora-titlebar{position:fixed;top:0;left:0;right:0;height:${BAR_H}px;z-index:2147483646;
        display:flex;align-items:center;gap:3px;padding:0 8px 0 14px;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#cfc9e6;
        background:linear-gradient(180deg,#16121f,#100d17);-webkit-user-select:none;user-select:none}
      #lumora-titlebar::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;
        background:linear-gradient(90deg,transparent,rgba(109,74,255,.75) 30%,rgba(217,70,160,.55) 70%,transparent)}
      #lumora-titlebar .drag{flex:1;height:100%;display:flex;align-items:center;gap:8px}
      #lumora-titlebar .brand{font-size:12.5px;font-weight:650;letter-spacing:.18em;text-transform:uppercase;
        background:linear-gradient(180deg,#fff,#9a7dff);-webkit-background-clip:text;background-clip:text;
        -webkit-text-fill-color:transparent}
      #lumora-titlebar button{all:unset;box-sizing:border-box;height:27px;min-width:34px;padding:0 10px;
        display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:13px;color:#cfc9e6;
        border-radius:8px;cursor:pointer;transition:background .12s ease,color .12s ease}
      #lumora-titlebar button svg{width:15px;height:15px;flex:none}
      #lumora-titlebar button:hover{background:rgba(154,125,255,0.20);color:#fff}
      #lumora-titlebar button:active{background:rgba(154,125,255,0.32)}
      #lumora-titlebar .sep{width:1px;height:17px;background:rgba(154,125,255,0.28);margin:0 5px}
      #lumora-titlebar .win{min-width:38px;padding:0}
      #lumora-titlebar .close:hover{background:#e5484d;color:#fff}
      #lumora-titlebar .on{background:rgba(109,74,255,0.42);color:#fff;box-shadow:0 0 0 1px rgba(154,125,255,0.6) inset}
      #lumora-titlebar .okpulse{background:rgba(80,200,140,0.30) !important;color:#eafff2 !important}
      #lumora-titlebar .errpulse{background:rgba(229,72,77,0.32) !important;color:#fff !important}
      .lm-exportwrap{position:relative;display:inline-flex}
      #lumora-menu{position:fixed;z-index:2147483647;min-width:190px;padding:6px;background:#1a1526;
        border:1px solid rgba(154,125,255,0.30);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,0.5);
        display:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      #lumora-menu.show{display:block}
      #lumora-menu .mi{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;
        height:34px;padding:0 10px;border-radius:8px;color:#d9d4f2;font-size:13px;cursor:pointer}
      #lumora-menu .mi:hover{background:rgba(154,125,255,0.18);color:#fff}
      #lumora-menu .mi svg{width:16px;height:16px;flex:none;opacity:.9}
      #lumora-menu .mh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a84a6;padding:4px 10px 6px}
      .lm-rz{position:fixed;z-index:2147483647}
      .lm-rz-t{top:0;left:10px;right:10px;height:4px;cursor:ns-resize}
      .lm-rz-b{bottom:0;left:10px;right:10px;height:6px;cursor:ns-resize}
      .lm-rz-l{left:0;top:10px;bottom:10px;width:6px;cursor:ew-resize}
      .lm-rz-r{right:0;top:10px;bottom:10px;width:6px;cursor:ew-resize}
      .lm-rz-tl{top:0;left:0;width:12px;height:12px;cursor:nwse-resize}
      .lm-rz-tr{top:0;right:0;width:12px;height:12px;cursor:nesw-resize}
      .lm-rz-bl{bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize}
      .lm-rz-br{bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize}
    `;
        document.head.appendChild(css);

        const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
        const ic = {
            reload: I('<path d="M21 12a9 9 0 1 1-2.9-6.6"/><path d="M21 3v6h-6"/>'),
            home:   I('<path d="m3 10 9-7 9 7"/><path d="M5 8.5V21h14V8.5"/>'),
            power:  I('<path d="M12 2v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>'),
            export: I('<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 15v4h14v-4"/>'),
            clip:   I('<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
            txt:    I('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>'),
            pdf:    I('<path d="M6 9V4a2 2 0 0 1 2-2h8l4 4v3"/><path d="M6 18h12"/><rect x="4" y="12" width="16" height="6" rx="1"/>'),
            pin:    I('<path d="M5 3h14"/><path d="M12 21V7"/><path d="m6 13 6-6 6 6"/>'),
            min:    I('<path d="M5 12h14"/>'),
            max:    I('<rect x="5" y="5" width="14" height="14" rx="1.5"/>'),
            close:  I('<path d="M6 6l12 12M18 6 6 18"/>')
        };

        const bar = document.createElement("div");
        bar.id = "lumora-titlebar";
        bar.innerHTML = `
      <div class="drag" data-drag><span class="brand">Lumora</span></div>
      <button data-reload title="Reload (Ctrl+R)">${ic.reload}Reload</button>
      <button data-home title="Home">${ic.home}Home</button>
      <span class="lm-exportwrap"><button data-export title="Export this conversation">${ic.export}Export</button></span>
      <button data-reset title="Log out &amp; clear this device">${ic.power}Reset</button>
      <div class="sep"></div>
      <button class="win" data-ontop title="Always on top">${ic.pin}</button>
      <button class="win" data-min title="Minimize">${ic.min}</button>
      <button class="win" data-max title="Maximize">${ic.max}</button>
      <button class="win close" data-close title="Hide to tray">${ic.close}</button>`;
        document.body.appendChild(bar);

        const menu = document.createElement("div");
        menu.id = "lumora-menu";
        menu.innerHTML = `
      <div class="mh">Export conversation</div>
      <button class="mi" data-x="clip">${ic.clip}Copy to clipboard</button>
      <button class="mi" data-x="txt">${ic.txt}Save to Downloads (.txt)</button>
      <button class="mi" data-x="pdf">${ic.pdf}Save as PDF…</button>`;
        document.body.appendChild(menu);

        const drag = bar.querySelector("[data-drag]");
        drag.addEventListener("mousedown", (e) => { if (e.button === 0 && win) call(() => win.startDragging()); });
        drag.addEventListener("dblclick", () => win && call(() => win.toggleMaximize()));

        bar.querySelector("[data-reload]").onclick = () => location.reload();
        bar.querySelector("[data-home]").onclick   = () => { location.href = "https://lumo.proton.me"; };
        bar.querySelector("[data-reset]").onclick  = () =>
        {
            if (!confirm("Log out and clear all Lumo data from this device?")) return;
            const done = () => { location.href = "https://lumo.proton.me"; };
            if (wvwin && wvwin.clearAllBrowsingData) Promise.resolve(wvwin.clearAllBrowsingData()).then(done).catch(done);
            else toast("Reset unavailable (missing permission)", true);
        };
        bar.querySelector("[data-min]").onclick   = () => win && call(() => win.minimize());
        bar.querySelector("[data-max]").onclick   = () => win && call(() => win.toggleMaximize());
        bar.querySelector("[data-close]").onclick = () => win && call(() => win.hide()); // to tray

        const exportBtn = bar.querySelector("[data-export]");
        const flash = (label, kind) =>
        {
            const old = exportBtn.innerHTML;
            exportBtn.innerHTML = `${ic.export}${label}`;
            exportBtn.classList.toggle("okpulse", kind === "ok");
            exportBtn.classList.toggle("errpulse", kind === "err");
            setTimeout(() => { exportBtn.innerHTML = old; exportBtn.classList.remove("okpulse","errpulse"); }, 1500);
        };
        const closeMenu = () => menu.classList.remove("show");
        const openMenu = () =>
        {
            const r = exportBtn.getBoundingClientRect();
            menu.style.top = (r.bottom + 4) + "px";
            menu.style.left = Math.min(r.left, window.innerWidth - 206) + "px";
            menu.classList.add("show");
        };
        exportBtn.onclick = (e) => { e.stopPropagation(); menu.classList.contains("show") ? closeMenu() : openMenu(); };
        document.addEventListener("click", (e) => { if (!menu.contains(e.target) && !exportBtn.contains(e.target)) closeMenu(); }, true);

        const copyText = async (text) =>
        {
            try { await navigator.clipboard.writeText(text); return true; }
            catch (_)
            {
                try
                {
                    const ta = document.createElement("textarea");
                    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
                    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
                    return true;
                } catch (e) { return false; }
            }
        };
        const printPdf = (md) =>
        {
            const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
            const rows = md.split(/\n## /).slice(1).map((blk) => {
                const nl = blk.indexOf("\n");
                const role = blk.slice(0, nl).trim();
                const text = blk.slice(nl + 1).replace(/^_.*?_\n+/, "").trim();
                const cls = /^you$/i.test(role) ? "you" : "lumo";
                return `<div class="msg ${cls}"><div class="role">${esc(role)}</div>${esc(text)}</div>`;
            }).join("");
            const holder = document.createElement("div");
            holder.id = "lumora-print";
            holder.innerHTML = `
        <style>
          @media print{ body>*{display:none !important} #lumora-print{display:block !important} @page{margin:16mm} }
          #lumora-print{display:none;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
          #lumora-print h1{font-size:22px;margin:0 0 4px}
          #lumora-print .sub{color:#666;font-size:12px;margin-bottom:24px}
          #lumora-print .msg{margin:0 0 18px;padding:12px 14px;border-radius:10px;white-space:pre-wrap;
            word-wrap:break-word;break-inside:avoid;font-size:13px;line-height:1.5}
          #lumora-print .you{background:#efeaff;border:1px solid #d9cffb}
          #lumora-print .lumo{background:#f6f6f8;border:1px solid #e6e6ee}
          #lumora-print .role{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6d4aff;margin-bottom:6px}
        </style>
        <h1>${esc(convTitle())}</h1>
        <div class="sub">Exported from Lumora · ${esc(new Date().toLocaleString())}</div>
        ${rows}`;
            document.body.appendChild(holder);
            const cleanup = () => { holder.remove(); window.removeEventListener("afterprint", cleanup); };
            window.addEventListener("afterprint", cleanup);
            setTimeout(() => { try { window.print(); } catch (_) { cleanup(); } }, 60);
            setTimeout(() => { const h = document.getElementById("lumora-print"); if (h) h.remove(); }, 60000);
        };

        menu.querySelectorAll(".mi").forEach((mi) => {
            mi.onclick = async () =>
            {
                closeMenu();
                const md = buildTranscript();

                if (!md) { flash("Nothing to export", "err"); return; }
                const kind = mi.getAttribute("data-x");

                if (kind === "clip")
                {
                    const ok = await copyText(md);
                    flash(ok ? "Copied ✓" : "Copy failed", ok ? "ok" : "err");
                }
                else if (kind === "txt")
                {
                    if (!evt || !evt.emit) { flash("Unavailable", "err"); return; }
                    try
                    {
                        await evt.emit("save-transcript", { filename: stampName(), contents: md });
                        flash("Saving…", "ok");
                    } catch (e) { console.error("[lumora] emit failed:", e); flash("Save failed", "err"); }
                }
                else if (kind === "pdf")
                {
                    printPdf(md);
                    flash("Opening print…", "ok");
                }
            };
        });

        const ontopBtn = bar.querySelector("[data-ontop]");
        let pinned = false;
        ontopBtn.onclick = () =>
        {
            if (!win) return;
            pinned = !pinned;
            call(() => win.setAlwaysOnTop(pinned));
            ontopBtn.classList.toggle("on", pinned);
        };

        const dirs = {t:"North",b:"South",l:"West",r:"East",tl:"NorthWest",tr:"NorthEast",bl:"SouthWest",br:"SouthEast"};
        Object.keys(dirs).forEach((k) =>
        {
            const h = document.createElement("div");
            h.className = "lm-rz lm-rz-" + k;
            h.addEventListener("mousedown", (e) => { if (e.button !== 0 || !win) return; e.preventDefault(); call(() => win.startResizeDragging(dirs[k])); });
            document.body.appendChild(h);
        });
    }

    document.addEventListener("keydown", async (e) =>
    {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "r" || e.key === "R")) { e.preventDefault(); location.reload(); return; }

        if (e.key === "F11" && win)
        {
            e.preventDefault();
            let fs = false; try { fs = await win.isFullscreen(); } catch (_) {}
            call(() => win.setFullscreen(!fs));
        }
    });

    splash();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", chrome, { once: true });
    else chrome();
})();