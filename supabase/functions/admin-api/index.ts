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
    // Fix: correctly extract the path after /admin-api
    const fullPath = url.pathname;
    const adminApiIndex = fullPath.indexOf("/admin-api");
    const path = adminApiIndex >= 0 ? fullPath.slice(adminApiIndex + "/admin-api".length) : fullPath;
    const method = req.method;

    // ── GET /stats ──────────────────────────────────────────────
    if (path === "/stats" && method === "GET") {
      const [productsResult, ordersResult, usersResult, walletsResult, withdrawalsResult] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id,total,status,created_at", { count: "exact" }),
        supabase.from("profiles").select("id,role,is_banned,is_active", { count: "exact" }),
        supabase.from("wallets").select("balance,total_earned"),
        supabase.from("withdrawal_requests").select("amount,status"),
      ]);

      const totalRevenue = (ordersResult.data || [])
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const pendingWithdrawals = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "pending")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalPaidOut = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "approved")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalWalletBalance = (walletsResult.data || [])
        .reduce((sum: number, w: any) => sum + parseFloat(w.balance || "0"), 0);

      const totalMerchantEarnings = (walletsResult.data || [])
        .reduce((sum: number, w: any) => sum + parseFloat(w.total_earned || "0"), 0);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentOrders = (ordersResult.data || []).filter(
        (o: any) => new Date(o.created_at) >= sevenDaysAgo
      );
      const recentRevenue = recentOrders
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const ordersByStatus: Record<string, number> = {};
      for (const o of ordersResult.data || []) {
        ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
      }

      const allUsers = usersResult.data || [];
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
        merchants: allUsers.filter((u: any) => u.role === "merchant").length,
        publishers: allUsers.filter((u: any) => u.role === "publisher").length,
        customers: allUsers.filter((u: any) => u.role === "customer").length,
        admins: allUsers.filter((u: any) => u.role === "admin").length,
        bannedUsers: allUsers.filter((u: any) => u.is_banned).length,
        inactiveUsers: allUsers.filter((u: any) => !u.is_active).length,
      };
      return jsonResponse({ stats });
    }

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
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const users = (profiles || []).map((p: any) => ({ ...p, email: emailMap[p.id] ?? "" }));
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

      await supabase
        .from("profiles")
        .update({ role, full_name: full_name || email.split("@")[0] })
        .eq("id", newUser.user.id);

      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: newUser.user.id });
      }

      return jsonResponse({ success: true, user_id: newUser.user.id });
    }

    // ── PUT /users/:id/role ──────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/role$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { role } = body;

      if (!role) return jsonResponse({ error: "Role required" }, 400);

      const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);

      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: userId });
      }

      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/ban ───────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/ban$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { is_banned } = body;

      const { error } = await supabase.from("profiles").update({ is_banned: !!is_banned }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/status ────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/status$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { is_active } = body;

      const { error } = await supabase.from("profiles").update({ is_active: !!is_active }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── DELETE /users/:id ────────────────────────────────────────
    if (path.match(/^\/users\/[^/]+$/) && method === "DELETE") {
      const userId = path.split("/")[2];
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) return jsonResponse({ error: deleteError.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/restrictions ──────────────────────────────
    if (path.match(/^\/users\/[^/]+\/restrictions$/) && method === "PUT") {
      const merchantId = path.split("/")[2];
      const body = await req.json();

      const { error } = await supabase.from("merchant_restrictions").upsert({
        merchant_id: merchantId,
        ...body,
        updated_at: new Date().toISOString(),
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /withdrawals ─────────────────────────────────────────
    if (path === "/withdrawals" && method === "GET") {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profile:profiles(full_name, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ withdrawals: data || [] });
    }

    // ── PUT /withdrawals/:id ─────────────────────────────────────
    if (path.match(/^\/withdrawals\/[^/]+$/) && method === "PUT") {
      const withdrawalId = path.split("/")[2];
      const body = await req.json();
      const { status, admin_note } = body;

      const { data: withdrawal, error: fetchError } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", withdrawalId)
        .single();
      if (fetchError || !withdrawal) return jsonResponse({ error: "Withdrawal not found" }, 404);

      const { error } = await supabase
        .from("withdrawal_requests")
        .update({ status, admin_note: admin_note || null, updated_at: new Date().toISOString() })
        .eq("id", withdrawalId);
      if (error) return jsonResponse({ error: error.message }, 500);

      if (status === "approved" && withdrawal.status !== "approved") {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", withdrawal.user_id)
          .single();

        if (wallet) {
          const newBalance = Math.max(0, parseFloat(wallet.balance || "0") - parseFloat(withdrawal.amount));
          await supabase
            .from("wallets")
            .update({ balance: newBalance.toFixed(2) })
            .eq("user_id", withdrawal.user_id);
        }
      }

      return jsonResponse({ success: true });
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
