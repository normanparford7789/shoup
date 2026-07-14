import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing auth header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_banned")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/admin-api", "");
    const method = req.method;

    // ── GET /users ──────────────────────────────────────────────
    if (path === "/users" && method === "GET") {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const userIds = (profiles || []).map((p: any) => p.id);
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({
          perPage: 1000,
        });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const users = (profiles || []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] ?? "",
      }));
      return jsonResponse({ users });
    }

    // ── POST /users/create-merchant ──────────────────────────────
    if (path === "/users/create-merchant" && method === "POST") {
      const body = await req.json();
      const { email, password, full_name, role } = body;

      if (!email || !password || !role) {
        return jsonResponse({ error: "Email, password, and role are required" }, 400);
      }

      const validRoles = ["merchant", "publisher", "admin"];
      if (!validRoles.includes(role)) {
        return jsonResponse({ error: "Invalid role for creation" }, 400);
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email.split("@")[0], role },
      });

      if (createError || !newUser?.user) {
        return jsonResponse({ error: createError?.message || "Failed to create user" }, 500);
      }

      // Update profile with role and name
      await supabase
        .from("profiles")
        .update({ role, full_name: full_name || email.split("@")[0] })
        .eq("id", newUser.user.id);

      // Create wallet for merchant/publisher
      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: newUser.user.id }).eq("user_id", newUser.user.id);
      }

      return jsonResponse({ success: true, user_id: newUser.user.id });
    }

    // ── PUT /users/:id/role ──────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/role$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const { role } = await req.json();
      const validRoles = ["customer", "publisher", "merchant", "admin"];
      if (!validRoles.includes(role)) {
        return jsonResponse({ error: "Invalid role" }, 400);
      }
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);

      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: userId }).eq("user_id", userId);
      }
      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/ban ────────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/ban$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const { is_banned, ban_reason } = await req.json();
      const update: any = { is_banned };
      if (ban_reason !== undefined) update.admin_notes = ban_reason;
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/active ────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/active$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const { is_active } = await req.json();
      const { error } = await supabase
        .from("profiles")
        .update({ is_active })
        .eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /withdrawals ─────────────────────────────────────────
    if (path === "/withdrawals" && method === "GET") {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profile:profiles!user_id(id, full_name, email, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ withdrawals: data });
    }

    // ── PUT /withdrawals/:id ─────────────────────────────────────
    if (path.match(/^\/withdrawals\/[^/]+$/) && method === "PUT") {
      const withdrawalId = path.split("/")[2];
      const { status, admin_notes } = await req.json();

      if (status === "paid") {
        const { error } = await supabase.rpc("process_withdrawal", {
          p_withdrawal_id: withdrawalId,
          p_status: "paid",
        });
        if (error) return jsonResponse({ error: error.message }, 500);
      } else {
        const { error } = await supabase
          .from("withdrawal_requests")
          .update({ status, admin_notes: admin_notes || null, processed_at: new Date().toISOString() })
          .eq("id", withdrawalId);
        if (error) return jsonResponse({ error: error.message }, 500);
      }

      // If rejected, refund to wallet
      if (status === "rejected") {
        const { data: wd } = await supabase
          .from("withdrawal_requests")
          .select("user_id, amount")
          .eq("id", withdrawalId)
          .single();
        if (wd) {
          await supabase.from("wallets")
            .update({ available_balance: supabase.rpc ? undefined : undefined })
            .eq("user_id", wd.user_id);
        }
      }

      return jsonResponse({ success: true });
    }

    // ── POST /withdrawals/batch-pay ───────────────────────────────
    if (path === "/withdrawals/batch-pay" && method === "POST") {
      const { ids } = await req.json();
      if (!Array.isArray(ids) || ids.length === 0) {
        return jsonResponse({ error: "No withdrawal IDs provided" }, 400);
      }

      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const id of ids) {
        const { error } = await supabase.rpc("process_withdrawal", {
          p_withdrawal_id: id,
          p_status: "paid",
        });
        if (error) {
          failCount++;
          errors.push(`${id}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      return jsonResponse({ success: true, successCount, failCount, errors });
    }

    // ── GET /restrictions/:merchantId ────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "GET") {
      const merchantId = path.split("/")[2];
      const { data, error } = await supabase
        .from("merchant_restrictions")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ restrictions: data });
    }

    // ── PUT /restrictions/:merchantId ─────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "PUT") {
      const merchantId = path.split("/")[2];
      const body = await req.json();
      const { error } = await supabase
        .from("merchant_restrictions")
        .upsert({
          merchant_id: merchantId,
          can_upload_products: body.can_upload_products ?? true,
          can_upload_reels: body.can_upload_reels ?? true,
          can_edit_products: body.can_edit_products ?? true,
          can_delete_products: body.can_delete_products ?? true,
          restricted_notes: body.restricted_notes || null,
        })
        .eq("merchant_id", merchantId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /orders ──────────────────────────────────────────────
    if (path === "/orders" && method === "GET") {
      const statusFilter = url.searchParams.get("status");
      let query = supabase
        .from("orders")
        .select("*, profile:profiles!user_id(id, full_name, email), items:order_items(id, product_id, quantity, subtotal, merchant_earnings, affiliate_earnings, product:products(id, name, price))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ orders: data });
    }

    // ── GET /products ─────────────────────────────────────────────
    if (path === "/products" && method === "GET") {
      const { data, error } = await supabase
        .from("products")
        .select("*, merchant:profiles!merchant_id(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ products: data });
    }

    // ── DELETE /products/:id ──────────────────────────────────────
    if (path.match(/^\/products\/[^/]+$/) && method === "DELETE") {
      const productId = path.split("/")[2];
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /wallets ──────────────────────────────────────────────
    if (path === "/wallets" && method === "GET") {
      const { data, error } = await supabase
        .from("wallets")
        .select("*, profile:profiles!user_id(id, full_name, email, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ wallets: data });
    }

    // ── GET /stats ────────────────────────────────────────────────
    if (path === "/stats" && method === "GET") {
      const [usersResult, ordersResult, withdrawalsResult, productsResult, walletsResult] = await Promise.all([
        supabase.from("profiles").select("id, role, is_banned, is_active", { count: "exact" }),
        supabase.from("orders").select("id, total, status, created_at", { count: "exact" }),
        supabase.from("withdrawal_requests").select("id, amount, status", { count: "exact" }),
        supabase.from("products").select("id", { count: "exact" }),
        supabase.from("wallets").select("available_balance, pending_balance, total_earned, total_withdrawn"),
      ]);

      const totalRevenue = (ordersResult.data || [])
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const pendingWithdrawals = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "pending")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalPaidOut = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "paid")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalWalletBalance = (walletsResult.data || []).reduce(
        (sum: number, w: any) => sum + parseFloat(w.available_balance || "0") + parseFloat(w.pending_balance || "0"),
        0
      );

      const totalMerchantEarnings = (walletsResult.data || []).reduce(
        (sum: number, w: any) => sum + parseFloat(w.total_earned || "0"),
        0
      );

      // Recent orders (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentOrders = (ordersResult.data || []).filter(
        (o: any) => new Date(o.created_at) >= sevenDaysAgo
      );
      const recentRevenue = recentOrders
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      // Orders by status
      const ordersByStatus: Record<string, number> = {};
      for (const o of ordersResult.data || []) {
        ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
      }

      const stats = {
        totalUsers: usersResult.count || 0,
        totalOrders: ordersResult.count || 0,
        totalProducts: productsResult.count || 0,
        totalRevenue: totalRevenue.toFixed(2),
        pendingWithdrawals: pendingWithdrawals.toFixed(2),
        totalPaidOut: totalPaidOut.toFixed(2),
        totalWalletBalance: totalWalletBalance.toFixed(2),
        totalMerchantEarnings: totalMerchantEarnings.toFixed(2),
        recentRevenue: recentRevenue.toFixed(2),
        recentOrdersCount: recentOrders.length,
        ordersByStatus,
        merchants: (usersResult.data || []).filter((u: any) => u.role === "merchant").length,
        publishers: (usersResult.data || []).filter((u: any) => u.role === "publisher").length,
        customers: (usersResult.data || []).filter((u: any) => u.role === "customer").length,
        admins: (usersResult.data || []).filter((u: any) => u.role === "admin").length,
        bannedUsers: (usersResult.data || []).filter((u: any) => u.is_banned).length,
        inactiveUsers: (usersResult.data || []).filter((u: any) => !u.is_active).length,
      };
      return jsonResponse({ stats });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    return jsonResponse({ error: (err as Error)?.message || "Internal server error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
