import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing affiliate code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    // SITE_URL is the app's public URL (e.g. Railway URL). Falls back to supabase url.
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

    // Look up the affiliate link by code
    const linkRes = await fetch(
      `${supabaseUrl}/rest/v1/affiliate_links?select=*,product:products(slug)&affiliate_code=eq.${encodeURIComponent(code)}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const linkData = await linkRes.json();
    const link = Array.isArray(linkData) ? linkData[0] : null;

    if (!link) {
      const fallback = siteUrl || supabaseUrl.replace(/\/$/, "");
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: fallback || "/" },
      });
    }

    // Record the click
    await fetch(`${supabaseUrl}/rest/v1/affiliate_clicks`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        affiliate_link_id: link.id,
        product_id: link.product_id,
      }),
    }).catch(() => {});

    // Increment clicks_count
    await fetch(`${supabaseUrl}/rest/v1/affiliate_links?id=eq.${link.id}`, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clicks_count: (link.clicks_count ?? 0) + 1 }),
    }).catch(() => {});

    // Redirect to product page on the SITE (not Supabase URL)
    const productSlug = link.product?.slug;
    const base = siteUrl || supabaseUrl.replace(/\/$/, "");
    const redirectUrl = productSlug
      ? `${base}/product/${productSlug}?ref=${encodeURIComponent(code)}`
      : base || "/";

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
