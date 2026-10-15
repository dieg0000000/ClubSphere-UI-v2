import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Palette {
  bg: string;
  bgAlt: string;
  bgHover: string;
  text: string;
  textMuted: string;
  border: string;
  tabBg: string;
  tabActive: string;
  tabActiveText: string;
  imgFilter: string;
}

const LIGHT_PALETTE: Palette = {
  bg: "#FFFFFF",
  bgAlt: "#F9FAFB",
  bgHover: "#E5E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  tabBg: "#F3F4F6",
  tabActive: "#0284C7",
  tabActiveText: "#FFFFFF",
  imgFilter: "brightness(1)",
};

const DARK_PALETTE: Palette = {
  bg: "#1e2a3a",
  bgAlt: "#243044",
  bgHover: "#2d3a4a",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  border: "#2d3a4a",
  tabBg: "#243044",
  tabActive: "#cc0000",
  tabActiveText: "#ffffff",
  imgFilter: "brightness(0.9)",
};

function buildStyleBlock(p: Palette): string {
  return `
<style>
  html, body {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  * {
    max-width: 100% !important;
    background-color: ${p.bg} !important;
    color: ${p.text} !important;
    border-color: ${p.border} !important;
  }
  body, html, div, table, tbody, thead, tr, td, th {
    background-color: ${p.bg} !important;
    color: ${p.text} !important;
    border-color: ${p.border} !important;
  }
  table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: auto !important;
    font-size: 13px !important;
  }
  tr:nth-child(even) td {
    background-color: ${p.bgAlt} !important;
  }
  tr:hover td {
    background-color: ${p.bgHover} !important;
  }
  th {
    background-color: ${p.bgAlt} !important;
    color: ${p.text} !important;
    font-weight: 600 !important;
  }
  @media (max-width: 768px) {
    table {
      font-size: 11px !important;
    }
    td, th {
      padding: 4px 2px !important;
      word-break: break-word !important;
    }
  }
  div {
    max-width: 100% !important;
    overflow-x: visible !important;
  }
  a, a:link, a:visited, a:hover, a:active {
    color: ${p.text} !important;
    text-decoration: none !important;
    cursor: default !important;
    pointer-events: none !important;
  }
  a[target="_blank"],
  table a,
  td a {
    color: ${p.text} !important;
  }
  [class*="Tab"], [class*="tab"], [class*="header"], [class*="Header"] {
    background-color: ${p.tabBg} !important;
    color: ${p.text} !important;
  }
  [class*="Active"], [class*="active"] {
    background-color: ${p.tabActive} !important;
    color: ${p.tabActiveText} !important;
  }
  img { filter: ${p.imgFilter}; }
  .sfv-tabs, .sfvTabs, [class*="sfvTab"],
  ul[class*="nav"], .nav-tabs,
  div[class*="TabStrip"], div[class*="tabstrip"],
  .RadTabStrip, .rtsUL {
    display: none !important;
  }
  td:last-child a, td:last-child img,
  .sfvMatchReport, [class*="report"], [class*="Report"] {
    display: none !important;
  }
  td:last-child,
  td:last-child *,
  .sfvMatchProtocol,
  [class*="protocol"],
  [class*="Protocol"],
  [class*="detail"],
  [class*="Detail"],
  a[href*="protocol"],
  a[href*="match"] {
    display: none !important;
  }
  a[href*="football.ch"],
  a[href*="acvf."],
  a[href*="al-la.ch"],
  a[href*="el-pl.ch"] {
    pointer-events: none !important;
    cursor: default !important;
    color: inherit !important;
    text-decoration: none !important;
  }
  i.fa,
  i.bi,
  i[class*="fa-"],
  i[class*="bi-"],
  .fa-list-alt,
  .bi-card-list {
    display: none !important;
  }
  a:has(> i.fa:only-child),
  a:has(> i.bi:only-child),
  td:has(> a > i.fa:only-child) {
    display: none !important;
  }
  .sfvTeamsContainer,
  .sfvTeams,
  [class*="sfvTeams"],
  [class*="TeamSelector"],
  .sfvDropdown,
  .sfvFooter,
  [class*="sfvFooter"] {
    display: none !important;
  }
  .sfvWidgetResultTable td:last-child,
  .sfvResultTable td:last-child,
  table td:last-child a,
  table td:last-child img,
  td:last-child input[type="checkbox"],
  td:last-child span {
    display: none !important;
  }
</style>
`;
}

const disableLinksScript = `
<script>
document.addEventListener('DOMContentLoaded', function() {
  var links = document.querySelectorAll('a[href*="football.ch"], a[href*="acvf."], a[href*="al-la.ch"], a[href*="el-pl.ch"]');
  links.forEach(function(link) {
    link.removeAttribute('href');
    link.style.cursor = 'default';
    link.style.color = 'inherit';
    link.style.textDecoration = 'none';
  });
  document.querySelectorAll('table tr td:last-child').forEach(function(td) {
    if (td.querySelector('a, img, input')) {
      td.style.display = 'none';
    }
  });
});
</script>
`;

const removeSquaresScript = `
<script>
function hideLastColumn() {
  document.querySelectorAll('table').forEach(function(table) {
    table.querySelectorAll('tr').forEach(function(tr) {
      var cells = tr.children;
      if (cells.length > 0) {
        var last = cells[cells.length - 1];
        last.style.display = 'none';
        last.style.width = '0';
      }
    });
  });
  document.querySelectorAll('a[href*="matchcenter"]').forEach(function(el) {
    var td = el.closest('td');
    if (td) td.style.display = 'none';
    el.style.display = 'none';
  });
  document.querySelectorAll('select, [role="combobox"], [role="listbox"]').forEach(function(el) {
    el.style.display = 'none';
  });
  document.querySelectorAll('a, button, div, span').forEach(function(el) {
    if (el.children.length === 0 && el.textContent.trim() === 'football.ch') {
      var parent = el.closest('div, footer, section');
      if (parent) parent.style.display = 'none';
    }
  });
}
hideLastColumn();
setTimeout(hideLastColumn, 200);
setTimeout(hideLastColumn, 800);
setTimeout(hideLastColumn, 2000);
var observer = new MutationObserver(hideLastColumn);
observer.observe(document.body, { childList: true, subtree: true });
</script>
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { widget_url, theme: rawTheme } = await req.json();
    const theme = rawTheme === "light" ? "light" : "dark";

    if (
      !widget_url ||
      typeof widget_url !== "string" ||
      !widget_url.startsWith("https://widget.football.ch/")
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing widget_url" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const upstream = await fetch(widget_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.football.ch/",
        Origin: "https://www.football.ch",
      },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${upstream.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const html = await upstream.text();
    const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
    const customCSS = buildStyleBlock(palette);

    let modifiedHtml = html.includes("</head>")
      ? html.replace("</head>", customCSS + "</head>")
      : customCSS + html;

    modifiedHtml = modifiedHtml.replace(/<ul[^>]*class="[^"]*nav[^"]*"[^>]*>[\s\S]*?<\/ul>/gi, '');
    modifiedHtml = modifiedHtml.replace(/<div[^>]*class="[^"]*[Tt]ab[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
    modifiedHtml = modifiedHtml.replace(/<a[^>]*class="[^"]*match[Rr]eport[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');
    modifiedHtml = modifiedHtml.replace(/<span[^>]*class="[^"]*icon[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
    modifiedHtml = modifiedHtml.replace(
      /<a[^>]*href="[^"]*matchcenter[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
      ''
    );

    modifiedHtml = modifiedHtml.includes("</body>")
      ? modifiedHtml.replace("</body>", disableLinksScript + removeSquaresScript + "</body>")
      : modifiedHtml + disableLinksScript + removeSquaresScript;

    return new Response(modifiedHtml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[football-widget-proxy] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
