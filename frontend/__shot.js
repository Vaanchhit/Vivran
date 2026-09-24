// TEMPORARY visual-verification script for the warm re-theme. Deleted after use.
const { chromium } = require("playwright");
const fs = require("fs");

const OUT = process.env.SHOT_OUT || "/tmp/vivran-shots";
const REF = "hhoddzvcfrvuqdtzxvmq";
const KEY = `sb-${REF}-auth-token`;

const FAKE_SESSION = {
  access_token: "fake.access.token",
  token_type: "bearer",
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  refresh_token: "fake-refresh",
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "asha@school.edu",
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Asha Menon", school: "Greenfield High" },
    identities: [],
  },
};

const PAGES = [
  ["login", "/login"],
  ["teacher", "/teacher"],
  ["create-slides", "/teacher/create?type=slides"],
  ["plan", "/teacher/plan"],
  ["assess-test", "/teacher/assess?mode=test"],
  ["materials", "/teacher/materials"],
  ["settings", "/teacher/settings"],
  ["recent", "/teacher/recent"],
];

const VIEWPORTS = [
  ["1440", { width: 1440, height: 1000 }],
  ["390", { width: 390, height: 844 }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [vpName, viewport] of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript(
        ([key, session, theme]) => {
          try {
            localStorage.setItem(key, JSON.stringify(session));
            localStorage.setItem("vivran_theme", theme);
          } catch {}
        },
        [KEY, FAKE_SESSION, theme],
      );
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      for (const [name, url] of PAGES) {
        try {
          await page.goto("http://localhost:3000" + url, { waitUntil: "networkidle", timeout: 45000 });
        } catch {
          try { await page.waitForTimeout(2500); } catch {}
        }
        await page.waitForTimeout(1200);
        const file = `${OUT}/${name}__${theme}__${vpName}.png`;
        await page.screenshot({ path: file, fullPage: vpName === "1440" });
        console.log("shot", file, "url=", page.url());
      }
      if (errors.length) console.log("PAGE ERRORS", theme, vpName, errors.slice(0, 3));
      await ctx.close();
    }
  }
  await browser.close();
})();
