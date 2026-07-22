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
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const url = new URL(req.url);
    const fullPath = url.pathname;
    const adminApiIndex = fullPath.indexOf("/admin-api");
    const path = adminApiIndex >= 0 ? fullPath.slice(adminApiIndex + "/admin-api".length) : fullPath;
    const method = req.method;
    const searchParams = url.searchParams;

    // ── GET /stats ──────────────────────────────────────────────
    if (path === "/stats" && method === "GET") {
      const [productsResult, ordersResult, usersResult, walletsResult, withdrawalsResult] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id,total,status,created_at", { count: "exact" }),
        supabase.from("profiles").select("id,role,is_banned,is_active", { count: "exact" }),
        supabase.from("wallets").select("available_balance,total_earned"),
        supabase.from("withdrawal_requests").select("amount,status"),
      ]);

      const totalRevenue = (ordersResult.data || [])
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const pendingWithdrawals = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "pending")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalPaidOut = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "approved" || w.status === "paid")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalWalletBalance = (walletsResult.data || [])
        .reduce((sum: number, w: any) => sum + parseFloat(w.available_balance || "0"), 0);

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

    // ── PUT /users/:id/active ────────────────────────────────────
    // (frontend calls /active; older code had /status — support both)
    if (path.match(/^\/users\/[^/]+\/(active|status)$/) && method === "PUT") {
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

    // ── GET /restrictions/:id ────────────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "GET") {
      const merchantId = path.split("/")[2];
      const { data, error } = await supabase
        .from("merchant_restrictions")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ restrictions: data || null });
    }

    // ── PUT /restrictions/:id ─────────────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "PUT") {
      const merchantId = path.split("/")[2];
      const body = await req.json();

      const { error } = await supabase.from("merchant_restrictions").upsert({
        merchant_id: merchantId,
        can_upload_products: body.can_upload_products,
        can_upload_reels: body.can_upload_reels,
        can_edit_products: body.can_edit_products,
        can_delete_products: body.can_delete_products,
        restricted_notes: body.restricted_notes,
        updated_at: new Date().toISOString(),
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /products ────────────────────────────────────────────
    if (path === "/products" && method === "GET") {
      const { data, error } = await supabase
        .from("products")
        .select("*, merchant:profiles!merchant_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch first image for each product
      const productIds = (data || []).map((p: any) => p.id);
      let imageMap: Record<string, string | null> = {};
      if (productIds.length > 0) {
        const { data: images } = await supabase
          .from("product_images")
          .select("product_id, image_url, sort_order")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        for (const img of images || []) {
          if (!imageMap[img.product_id]) {
            imageMap[img.product_id] = img.image_url;
          }
        }
      }

      // Get stock from variants
      let stockMap: Record<string, number> = {};
      if (productIds.length > 0) {
        const { data: variants } = await supabase
          .from("product_variants")
          .select("product_id, stock")
          .in("product_id", productIds);
        for (const v of variants || []) {
          stockMap[v.product_id] = (stockMap[v.product_id] || 0) + (v.stock || 0);
        }
      }

      // Fetch merchant emails
      const merchantIds = [...new Set((data || []).map((p: any) => p.merchant_id).filter(Boolean))];
      let merchantEmailMap: Record<string, string> = {};
      if (merchantIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          merchantEmailMap[u.id] = u.email ?? "";
        }
      }

      const products = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        price: String(p.price),
        category: p.category_id || "",
        image_url: imageMap[p.id] || null,
        stock: stockMap[p.id] || 0,
        merchant_id: p.merchant_id,
        created_at: p.created_at,
        merchant: p.merchant ? { id: p.merchant_id, full_name: p.merchant.full_name, email: merchantEmailMap[p.merchant_id] ?? "" } : null,
      }));
      return jsonResponse({ products });
    }

    // ── DELETE /products/:id ─────────────────────────────────────
    if (path.match(/^\/products\/[^/]+$/) && method === "DELETE") {
      const productId = path.split("/")[2];

      // Delete related images and variants first
      await supabase.from("product_images").delete().eq("product_id", productId);
      await supabase.from("product_variants").delete().eq("product_id", productId);
      await supabase.from("cart_items").delete().eq("product_id", productId);
      await supabase.from("wishlist_items").delete().eq("product_id", productId);

      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /orders ─────────────────────────────────────────────
    if (path === "/orders" && method === "GET") {
      const statusFilter = searchParams.get("status");
      let query = supabase
        .from("orders")
        .select("*, profile:profiles!user_id(full_name), items:order_items(*)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch emails separately (profiles has no email column)
      const userIds = [...new Set((data || []).map((o: any) => o.user_id).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const orders = (data || []).map((o: any) => ({
        id: o.id,
        user_id: o.user_id,
        total: String(o.total),
        status: o.status,
        created_at: o.created_at,
        affiliate_code: o.affiliate_code || null,
        affiliate_user_id: o.affiliate_user_id || null,
        profile: o.profile ? { ...o.profile, email: emailMap[o.user_id] ?? "" } : null,
        items: o.items || [],
      }));
      return jsonResponse({ orders, count: data?.length || 0 });
    }

    // ── GET /withdrawals ─────────────────────────────────────────
    if (path === "/withdrawals" && method === "GET") {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profile:profiles!user_id(full_name, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch emails separately
      const userIds = [...new Set((data || []).map((w: any) => w.user_id).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const withdrawals = (data || []).map((w: any) => ({
        ...w,
        profile: w.profile ? { ...w.profile, email: emailMap[w.user_id] ?? "" } : null,
      }));
      return jsonResponse({ withdrawals });
    }

    // ── PUT /withdrawals/:id ─────────────────────────────────────
    if (path.match(/^\/withdrawals\/[^/]+$/) && method === "PUT") {
      const withdrawalId = path.split("/")[2];
      const body = await req.json();
      const { status, admin_notes } = body;

      const { data: withdrawal, error: fetchError } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", withdrawalId)
        .maybeSingle();
      if (fetchError || !withdrawal) return jsonResponse({ error: "Withdrawal not found" }, 404);

      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status,
          admin_notes: admin_notes || null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawalId);
      if (error) return jsonResponse({ error: error.message }, 500);

      // Deduct from wallet when approved or paid
      if ((status === "approved" || status === "paid") && withdrawal.status !== "approved" && withdrawal.status !== "paid") {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("available_balance")
          .eq("user_id", withdrawal.user_id)
          .maybeSingle();

        if (wallet) {
          const newBalance = Math.max(0, parseFloat(wallet.available_balance || "0") - parseFloat(withdrawal.amount));
          const updateData: any = {
            available_balance: newBalance.toFixed(2),
            updated_at: new Date().toISOString(),
          };
          if (status === "paid") {
            updateData.total_withdrawn = (parseFloat(wallet.available_balance || "0") > parseFloat(withdrawal.amount)
              ? parseFloat(withdrawal.amount)
              : parseFloat(wallet.available_balance || "0")).toFixed(2);
          }
          await supabase
            .from("wallets")
            .update(updateData)
            .eq("user_id", withdrawal.user_id);
        }
      }

      return jsonResponse({ success: true });
    }

    // ── POST /withdrawals/batch-pay ──────────────────────────────
    if (path === "/withdrawals/batch-pay" && method === "POST") {
      const body = await req.json();
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return jsonResponse({ error: "No withdrawal IDs provided" }, 400);
      }

      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const id of ids) {
        const { data: withdrawal, error: fetchError } = await supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (fetchError || !withdrawal) {
          failCount++;
          errors.push(`Withdrawal ${id} not found`);
          continue;
        }

        if (withdrawal.status === "paid" || withdrawal.status === "approved") {
          failCount++;
          errors.push(`Withdrawal ${id} already processed`);
          continue;
        }

        const { error: updateError } = await supabase
          .from("withdrawal_requests")
          .update({
            status: "paid",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) {
          failCount++;
          errors.push(`Failed to update ${id}: ${updateError.message}`);
          continue;
        }

        const { data: wallet } = await supabase
          .from("wallets")
          .select("available_balance, total_withdrawn")
          .eq("user_id", withdrawal.user_id)
          .maybeSingle();

        if (wallet) {
          const newBalance = Math.max(0, parseFloat(wallet.available_balance || "0") - parseFloat(withdrawal.amount));
          await supabase
            .from("wallets")
            .update({
              available_balance: newBalance.toFixed(2),
              total_withdrawn: (parseFloat(wallet.total_withdrawn || "0") + parseFloat(withdrawal.amount)).toFixed(2),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", withdrawal.user_id);
        }

        successCount++;
      }

      return jsonResponse({ successCount, failCount, errors });
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
